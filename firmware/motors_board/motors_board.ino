#include <WiFi.h>
#include "secrets.h" 
#include <Firebase_ESP_Client.h>
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"

//  NETWORK CREDENTIALS
const char ssid[] = SECRET_SSID;
const char pass[] = SECRET_PASS;
const int WIFI_CONNECTION_ATTEMPTS = 30;

//  FIREBASE OBJECTS
FirebaseData fbdo;          // Used in loop for write operations (resetting to 0)
FirebaseData fbdo_stream;   // Used in background for listening to commands
FirebaseAuth auth;
FirebaseConfig config;

//  HARDWARE CONFIGURATION
#define NUM_MOTORS 6
#define RELAY_ON LOW
#define RELAY_OFF HIGH
#define SWITCH_PRESSED LOW

const uint8_t PIN_RELAYS[NUM_MOTORS]    = {13, 14, 16, 17, 25, 26}; 
const uint8_t PIN_FEEDBACKS[NUM_MOTORS] = {34, 35, 36, 39, 32, 33};

//  STATE MACHINE & TIMINGS
volatile int currentMotor = -1;      // -1 means system is idle
volatile unsigned long motorStartTime = 0;
volatile int targetQuantity = 1;     // Products to dispense (1-4)
volatile int dispensedCount = 0;     // Products already dropped

const unsigned long CAM_CLEAR_DELAY_MS = 1000; // Blind spot to let the cam clear the switch
const unsigned long MOTOR_TIMEOUT_MS   = 5000; // Safety timeout per single rotation
const int MAX_DISPENSE_QTY = 4;


//BACKGROUND COMMAND LISTENER

void streamCallback(FirebaseStream data) {
  if (data.eventType() == "put" || data.eventType() == "patch") {
    
    int command = data.intData(); 
    
    // Check if command is a valid motor ID and system is idle
    if (command >= 1 && command <= NUM_MOTORS && currentMotor == -1) {
      
      // Fetch quantity
      if (Firebase.RTDB.getInt(&fbdo, "/quantita")) {
        targetQuantity = fbdo.intData();
        
        // Safety bounds check
        if (targetQuantity < 1 || targetQuantity > MAX_DISPENSE_QTY) {
          targetQuantity = 1;
        }
      } else {
        targetQuantity = 1; 
        Serial.println("Error reading /quantita, default applied: 1");
      }

      // Set paramenters and start motor
      currentMotor = command - 1;
      dispensedCount = 0;            
      motorStartTime = millis();     
      
      Serial.printf(">>> Server Command: Start Motor %d to dispense %d unit(s)\n", command, targetQuantity);
      digitalWrite(PIN_RELAYS[currentMotor], RELAY_ON);
    }
  }
}

void streamTimeoutCallback(bool timeout) {
  if (timeout) {
    Serial.println("Stream timeout, reconnecting...");
  }
}


// SYSTEM SETUP

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
  Serial.println(WiFi.status() == WL_CONNECTED ? "\nWiFi Connected" : "\nConnection failed");
}

void startStreams() {
  if (!Firebase.RTDB.beginStream(&fbdo_stream, "/motore")) {
    Serial.printf("Stream start error: %s\n", fbdo_stream.errorReason().c_str());
  }
  Firebase.RTDB.setStreamCallback(&fbdo_stream, streamCallback, streamTimeoutCallback);
}

void setup() {
  Serial.begin(115200);

  // Initialize hardware pins
  for (int i = 0; i < NUM_MOTORS; i++) {
    pinMode(PIN_RELAYS[i], OUTPUT);
    digitalWrite(PIN_RELAYS[i], RELAY_OFF); 
    pinMode(PIN_FEEDBACKS[i], INPUT); 
  }

  connectToWiFi();

  // Configure Firebase
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  config.timeout.serverResponse = 10000;     
  config.timeout.rtdbKeepAlive = 45000;  

  if (Firebase.signUp(&config, &auth, "", "")) {
    Serial.println("CONNECTED TO FIREBASE RTDB");
  } else {
    Serial.printf("DB Error: %s\n", config.signer.signupError.message.c_str());
  }

  config.token_status_callback = tokenStatusCallback;
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true); 

  startStreams();
}


// HARDWARE MANAGEMENT & SAFETY LOGIC

void loop() {
  
  if (currentMotor != -1) {
    unsigned long elapsedTime = millis() - motorStartTime;

    // Check if the cam has cleared the limit switch blind spot
    if (elapsedTime > CAM_CLEAR_DELAY_MS) {
      
      // Normal Operation: Limit switch triggered (one full rotation complete)
      if (digitalRead(PIN_FEEDBACKS[currentMotor]) == SWITCH_PRESSED) {
        
        dispensedCount++; 
        
        // If target quantity reached
        if (dispensedCount >= targetQuantity) {
          digitalWrite(PIN_RELAYS[currentMotor], RELAY_OFF); 
          Serial.printf("<<< Dispense complete: %d/%d dropped. Motor stopped.\n", dispensedCount, targetQuantity);
          
          if (WiFi.status() == WL_CONNECTED && Firebase.ready()) {
            Firebase.RTDB.setInt(&fbdo, "/motore", 0);
          }
          currentMotor = -1; // Free the state machine
        } 
        // If more products to dispense
        else {
          Serial.printf("--- Product %d/%d dropped. Continuing rotation...\n", dispensedCount, targetQuantity);
          // Reset the timer to re-trigger the blind spot without stopping the motor
          motorStartTime = millis(); 
        }
      }
      
      // Timeout on a single rotation (e.g. jamming)
      else if (elapsedTime > MOTOR_TIMEOUT_MS) {
        
        digitalWrite(PIN_RELAYS[currentMotor], RELAY_OFF); 
        Serial.printf("!!! TIMEOUT ERROR: Jam at product %d/%d. Forced stop!\n", dispensedCount + 1, targetQuantity);
        
        if (WiFi.status() == WL_CONNECTED && Firebase.ready()) {
          Firebase.RTDB.setInt(&fbdo, "/motore", 0);
        }
        currentMotor = -1; 
      }
    }
  }
}