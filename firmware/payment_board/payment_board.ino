#include <WiFi.h>
#include "secrets.h"
#include <Firebase_ESP_Client.h>
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"
#include <ESP32Servo.h>
#include <SPI.h>
#include <MFRC522.h>

//  NETWORK CREDENTIALS
const char ssid[] = SECRET_SSID;
const char pass[] = SECRET_PASS;
const int WIFI_CONNECTION_ATTEMPTS = 30;

//  FIREBASE OBJECTS
FirebaseData fbdo, fbdo_stream, fbdo_async, fbdo_nfc;
FirebaseAuth auth;
FirebaseConfig config;
bool isDbConnected = false;

//  NFC / SPI PINS & CONFIG
#define PIN_SPI_SS   5
#define PIN_SPI_RST  17
#define PIN_SPI_SCK  14
#define PIN_SPI_MOSI 13
#define PIN_SPI_MISO 16

MFRC522 mfrc522(PIN_SPI_SS, PIN_SPI_RST);
const byte AUTHORIZED_UID[4] = { 0x97, 0x90, 0x35, 0x25 };

//  HARDWARE CONTROLS
const uint8_t PIN_COIN_RELAY = 4;
#define RELAY_ON  LOW
#define RELAY_OFF HIGH

// SERVO (CHANGE) CONFIGURATION
Servo myServo1; // SERVO 2.00
Servo myServo2; // SERVO 1.00
Servo myServo3; // SERVO 0.50
Servo myServo4; // SERVO 0.20
Servo myServo5; // SERVO 0.10
Servo myServo6; // SERVO 0.05

// COIN SENSORS CONFIGURATION 
const int pinSensori[6] = {26, 27, 32, 33, 34, 35};
const float valoreMonete[6] = {0.10, 0.05, 0.20, 0.50, 1.00, 2.00};
volatile unsigned long ultimoPassaggio[6] = {0, 0, 0, 0, 0, 0};
bool statoPrecedente[6] = {HIGH, HIGH, HIGH, HIGH, HIGH, HIGH};

// FINANCIAL & SYSTEM VARIABLES
volatile float prezzo = 0;
volatile float saldo = 0;
volatile int nfcState = 0; 

// FREERTOS TASK VARIABLES
TaskHandle_t TaskFirebase;
volatile float ultimo_saldo_inviato = -1.0; 

// STATE MACHINE 
enum SystemState {
  STATE_IDLE,            // Waiting for a price from the server or NFC tap
  STATE_START_PAYMENT,   // Unlocks the mechanical coin acceptor
  STATE_WAIT_RELAY,      // Non-blocking wait for mechanical relay activation
  STATE_INSERT_COINS,    // Actively polling coin sensors and matching target price
  STATE_WAIT_NFC,        // Waiting for RFID/NFC card read or timeout
  STATE_DISPENSE_CHANGE  // Dispensing change sequentially and resetting system
};

SystemState currentState = STATE_IDLE;
unsigned long stateTimer = 0;

//  FUNCTION PROTOTYPES 
void connectToWiFi();
void startStreams();
void resetSystemData();
void dispenseChange();
void readCoinsAsync();


// FREERTOS ASYNC TASK: UPDATE BALANCE TO FIREBASE
/**
 * Background task pinned to Core 0 for database synchronization.
 * 
 * Isolating network operations (WiFi/Firebase) on a separate CPU core prevents 
 * network latency from blocking the main loop (which runs on Core 1). 
 * This architectural choice guarantees that fast hardware interrupts and 
 * sensor polling (like the coin acceptor) are never interrupted, 
 * ensuring zero missed coins even if the WiFi connection slows down.
 */

void TaskUpdateBalance(void * pvParameters) {
  for (;;) {
    if (isDbConnected && Firebase.ready()) {
      if (saldo != ultimo_saldo_inviato) {
        float saldo_da_inviare = saldo;
        if (Firebase.RTDB.setFloat(&fbdo_async, "/saldo", saldo_da_inviare)) {
          ultimo_saldo_inviato = saldo_da_inviare;
          Serial.println("DB: Saldo aggiornato a " + String(saldo_da_inviare));
        }
      }
    }
    // Yields control to other tasks, preventing Watchdog Timer (WDT) crashes
    vTaskDelay(100 / portTICK_PERIOD_MS);
  }
}


// SYSTEM SETUP

void setup() {
  Serial.begin(115200);

  // Init Servos
  myServo1.attach(18);
  myServo2.attach(19);
  myServo3.attach(21);
  myServo4.attach(22);
  myServo5.attach(23);
  myServo6.attach(25);

  myServo1.write(0); myServo2.write(0); myServo3.write(0);
  myServo4.write(0); myServo5.write(0); myServo6.write(0);

  // Init Coin Sensors
  for (int i = 0; i < 6; i++) {
    pinMode(pinSensori[i], INPUT);
  }

  // Init Relay
  pinMode(PIN_COIN_RELAY, OUTPUT);
  digitalWrite(PIN_COIN_RELAY, RELAY_OFF);

  // Init SPI & NFC
  SPI.begin(PIN_SPI_SCK, PIN_SPI_MISO, PIN_SPI_MOSI, PIN_SPI_SS);
  mfrc522.PCD_Init();

  connectToWiFi();

  // Firebase Init
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  config.timeout.serverResponse = 10000;     
  config.timeout.rtdbKeepAlive = 45000;    

  if (Firebase.signUp(&config, &auth, "", "")) {
    Serial.println("CONNECTED TO DB");
    isDbConnected = true;
  } else {
    Serial.printf("DB ERROR: %s\n", config.signer.signupError.message.c_str());
  }

  config.token_status_callback = tokenStatusCallback;
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  // Start background task
  xTaskCreatePinnedToCore(TaskUpdateBalance, "TaskSaldo", 10000, NULL, 1, &TaskFirebase, 0);

  startStreams();
}

void connectToWiFi() {
  WiFi.begin(ssid, pass);
  Serial.print("Connecting to WiFi");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < WIFI_CONNECTION_ATTEMPTS) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  WiFi.setSleep(false);
  Serial.println(WiFi.status() == WL_CONNECTED ? "\nWiFi connected" : "\nConnection failed");
}

void startStreams() {
    Firebase.RTDB.beginStream(&fbdo_stream, "/percorso");
}


// COIN READER LOGIC (NON-BLOCKING)

void readCoinsAsync() {
  unsigned long ora = millis();
  for (int i = 0; i < 6; i++) {
    int lettura = digitalRead(pinSensori[i]);
    
    if (lettura == LOW && statoPrecedente[i] == HIGH) {
      if (ora - ultimoPassaggio[i] > 150) {
        saldo += valoreMonete[i];
        ultimoPassaggio[i] = ora;
        Serial.println("Inserita moneta: " + String(valoreMonete[i]) + " | Saldo: " + String(saldo));
      }
    }
    statoPrecedente[i] = lettura; 
  }
}


// DISPENSE CHANGE LOGIC 

void dispenseChange() {
  
  // Check if connected to wifi & DB
  if (isDbConnected && Firebase.ready()) {
    Firebase.RTDB.setFloat(&fbdo_async, "/saldo", saldo);
  }

  saldo = saldo - prezzo; // Calculate the change to give

  while (saldo >= 1.95 ) { 
    myServo1.write(180); delay(1000); myServo1.write(0); delay(1000);
    saldo -= 2.0; Serial.println(saldo);
  }
  while (saldo >= 0.95 ) { 
    myServo2.write(180); delay(1000); myServo2.write(0); delay(1000);
    saldo -= 1.0; Serial.println(saldo);
  }
  while (saldo >= 0.45 ) { 
    myServo3.write(180); delay(1000); myServo3.write(0); delay(1000);
    saldo -= 0.5; Serial.println(saldo);
  }
  while (saldo >= 0.15 ) { 
    myServo4.write(180); delay(1000); myServo4.write(0); delay(1000);
    saldo -= 0.2; Serial.println(saldo);
  }
  while (saldo >= 0.08 ) { 
    myServo5.write(180); delay(1000); myServo5.write(0); delay(1000);
    saldo -= 0.1; Serial.println(saldo);
  }
  while (saldo >= 0.03 ) { 
    myServo6.write(180); delay(1000); myServo6.write(0); delay(1000);
    saldo -= 0.05; Serial.println(saldo);
  }

  resetSystemData();
  currentState = STATE_IDLE; 
}

void resetSystemData() {
  saldo = 0;  
  prezzo = 0;
}


// MAIN LOOP & STATE MACHINE

void loop() {
  
  // FIREBASE STREAM LISTENER
  if (WiFi.status() == WL_CONNECTED && isDbConnected && Firebase.ready()) {
    if (!Firebase.RTDB.readStream(&fbdo_stream)) {
      Serial.println("Stream error: " + fbdo_stream.errorReason());
    }

    if (fbdo_stream.streamAvailable()) {
      String path = fbdo_stream.dataPath(); 
      String dataType = fbdo_stream.dataType();

      if (path == "/prezzo" && dataType == "float") {
          prezzo = fbdo_stream.floatData(); 
          Serial.println("Ricevuto nuovo PREZZO: " + String(prezzo)); 
      } 
      else if (path == "/stato_nfc" && dataType == "int") {
          nfcState = fbdo_stream.intData(); 
          Serial.println("Ricevuto nuovo comando NFC: " + String(nfcState)); 
      }
    }
  }

  // STATE MACHINE
  switch (currentState) {
    
    // Wait for price or NFC request from DB
    case STATE_IDLE:
      if (prezzo > 0) {
        currentState = STATE_START_PAYMENT;
      } 
      else if (nfcState == 1) {
        stateTimer = millis();
        currentState = STATE_START_PAYMENT;
        Serial.println("Attesa strisciata carta (NFC)...");
      }
      break;
    
    // Turn on coin mechanism and NFC reader
    case STATE_START_PAYMENT:
      digitalWrite(PIN_COIN_RELAY, RELAY_ON); 
      stateTimer = millis();     
      currentState = STATE_WAIT_RELAY; 
      Serial.println("Apertura gettoniera in corso...");
      break;
    
    /*
      * Wait for the coin mechanism to turn on and consider an extra second 
      * so as not to consider the voltage peaks given by the ignition as coins
    */
    case STATE_WAIT_RELAY:
      if (millis() - stateTimer >= 1500) {
        if(prezzo > 0){
          currentState = STATE_INSERT_COINS;
          Serial.println("Pronto per ricevere le monete!");
        } else if (nfcState == 1){
           currentState = STATE_WAIT_NFC;
           Serial.println("Pronto per leggere la carta!");
        }
      }
      break;

    // Read and classify the coin as soon as it enters the mechanism
    case STATE_INSERT_COINS:
      readCoinsAsync();
      
      if (saldo >= prezzo && prezzo > 0) {
        stateTimer = millis();  
        currentState = STATE_DISPENSE_CHANGE;
        digitalWrite(PIN_COIN_RELAY, RELAY_OFF); 
        Serial.println("Pagamento completato. Attesa 12 secondi caduta prodotti...");
      }
      break;

    // Wait for a card to be read by the NFC reader, if the card is accepted the payment is successful, otherwise it fails.
    case STATE_WAIT_NFC:
      if (millis() - stateTimer >= 15000) {
        digitalWrite(PIN_COIN_RELAY, RELAY_OFF); 
        nfcState = 3; 
        Serial.println("Timeout NFC - Annullato");
        currentState = STATE_IDLE;       
        
        if (isDbConnected && Firebase.ready()) {
          Firebase.RTDB.setInt(&fbdo_nfc, "/percorso/stato_nfc", nfcState);
        }
      } 
      else if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
        digitalWrite(PIN_COIN_RELAY, RELAY_OFF); 
        
        bool match = true;
        for (byte i = 0; i < 4; i++) {
          if (mfrc522.uid.uidByte[i] != AUTHORIZED_UID[i]) match = false;
        }

        if (match) {
          nfcState = 2; 
          Serial.println("NFC: Pagamento riuscito");
        } else {
          nfcState = 3; 
          Serial.println("NFC: Carta non autorizzata");
        }
        
        currentState = STATE_IDLE;
        
        if (isDbConnected && Firebase.ready()) {
          Firebase.RTDB.setInt(&fbdo_nfc, "/percorso/stato_nfc", nfcState);
        }
        
        mfrc522.PICC_HaltA();
        mfrc522.PCD_StopCrypto1();
        resetSystemData();
      }
      break;

    // After item is dropped ii dispende change if necessary
    case STATE_DISPENSE_CHANGE:
      if (millis() - stateTimer >= 12000) { 
        dispenseChange();
      }
      break;
  }
}