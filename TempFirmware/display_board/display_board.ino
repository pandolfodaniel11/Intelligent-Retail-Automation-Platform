#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "fonts.h"
#include <WiFi.h>
#include "secrets.h"
#include <Firebase_ESP_Client.h>
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"

//  HARDWARE CONFIGURATION
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1     // Reset pin (-1 if sharing ESP32 reset pin)
#define OLED_ADDR     0x3C   // Standard I2C address for SSD1306
#define TCAADDR       0x70   // Standard I2C address for TCA9548A multiplexer
#define NUM_DISPLAYS  6      // Number of connected OLED displays

//NETWORK & FIREBASE CREDENTIALS
// Credentials imported securely from secrets.h
char ssid[] = SECRET_SSID;
char pass[] = SECRET_PASS;

const int WIFI_CONNECTION_ATTEMPTS = 30;
bool isDatabaseConnected = false;
float priceArray[NUM_DISPLAYS];

FirebaseData fbdo, fbdoStream;
FirebaseAuth auth;
FirebaseConfig config;

// Single display object to save RAM, routed via I2C multiplexer
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

//  FUNCTION PROTOTYPES
void connectToWiFi();
void initFirebase();
void startStreams();
void updateDisplayPrice(int displayIndex, float price);
void initDisplays();
void fetchAllPrices();

//  MULTIPLEXER ROUTING
//Routes the I2C bus to the specific channel on the TCA9548A multiplexer.
void tcaSelect(uint8_t channel) {
  if (channel > 7) return; 
  Wire.beginTransmission(TCAADDR);
  Wire.write(1 << channel);
  Wire.endTransmission();
}

void setup() {
  Serial.begin(115200);
  Wire.begin(); 

  connectToWiFi();
  initFirebase();

  // Initial data sync and hardware setup
  fetchAllPrices();
  initDisplays();
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
  
  WiFi.setSleep(false); // Prevents ESP32 from dropping connection
  Serial.println(WiFi.status() == WL_CONNECTED ? "\nWiFi connected" : "\nConnection failed");
}

void initFirebase() {
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  config.timeout.serverResponse = 10000;     
  config.timeout.rtdbKeepAlive = 45000;  

  if (Firebase.signUp(&config, &auth, "", "")) {
    Serial.println("Connected to Firebase Auth.");
    isDatabaseConnected = true;
  } else {
    Serial.printf("Firebase error: %s\n", config.signer.signupError.message.c_str());
  }

  config.token_status_callback = tokenStatusCallback;
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

/**
 * Initializes all connected OLED displays and renders their initial prices.
 */
void initDisplays() {
  for(int i = 0; i < NUM_DISPLAYS; i++) {
    tcaSelect(i); 

    // Note: Calling begin() initializes the hardware. 
    if(!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
      Serial.printf("Error: SSD1306 allocation failed for display %d\n", i);
      continue;
    }

    // Static UI settings
    display.setFont(&Chewy_Regular_65);
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    
    updateDisplayPrice(i, priceArray[i]);
  }
}

/**
 * Fetches the entire /display JSON tree once at startup to avoid multiple API calls.
 */
void fetchAllPrices() {
  Serial.println("Fetching initial prices from DB...");
  
  if (Firebase.RTDB.getJSON(&fbdo, "/display")) {
    FirebaseJson &json = fbdo.jsonObject();
    FirebaseJsonData result; 

    String keys[NUM_DISPLAYS] = {"prodotto1", "prodotto2", "prodotto3", "prodotto4", "prodotto5", "prodotto6"};

    for (int i = 0; i < NUM_DISPLAYS; i++) {
      json.get(result, keys[i]); 
      
      if (result.success) {
        priceArray[i] = result.to<float>(); 
        Serial.println("Loaded " + keys[i] + ": " + String(priceArray[i]));
      } else {
        priceArray[i] = 0.00; 
        Serial.println("Warning: " + keys[i] + " missing. Defaulting to 0.00");
      }
    }
  } else {
    Serial.println("Read Error: " + fbdo.errorReason());
  }
}

/**
 * Calculates dynamic text boundaries and centers the price on the specified screen.
 */
void updateDisplayPrice(int displayIndex, float price) {
  tcaSelect(displayIndex);
  display.clearDisplay();
  
  String priceStr = String(price, 2);

  // Dynamic boundary calculation to center varying string lengths (e.g., "9.00" vs "100.00")
  int16_t x1, y1;
  uint16_t w, h;
  display.getTextBounds(priceStr, 0, 0, &x1, &y1, &w, &h);

  int x = (SCREEN_WIDTH - w) / 2 - x1;
  int y = (SCREEN_HEIGHT - h) / 2 - y1;

  display.setCursor(x, y);
  display.print(priceStr);
  display.display(); 
}

void startStreams() {
    Firebase.RTDB.beginStream(&fbdoStream, "/display");
}

void loop() {
  // Only process if WiFi is alive and Database is authenticated
  if (WiFi.status() == WL_CONNECTED && isDatabaseConnected && Firebase.ready()) {
    
    if (!Firebase.RTDB.readStream(&fbdoStream)) {
      Serial.println("Stream error: " + fbdoStream.errorReason());
    }

    if (fbdoStream.streamAvailable()) {
      String path = fbdoStream.dataPath();      // Example: "/prodotto1"
      String dataType = fbdoStream.dataType();
      float price = fbdoStream.floatData(); 

      if (dataType == "float" && path.startsWith("/prodotto")) {
        // Extract the number at the end of the string (e.g., "1" from "/prodotto1")
        int productNumber = path.substring(9).toInt();
        
        int displayIndex = productNumber - 1; 

        if (displayIndex >= 0 && displayIndex < NUM_DISPLAYS) {
          updateDisplayPrice(displayIndex, price);
          Serial.printf("Real-time update: Display %d set to %.2f\n", displayIndex, price);
        }
      }
    }
  }   
}