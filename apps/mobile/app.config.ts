import type { ConfigContext, ExpoConfig } from "expo/config";

const iosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME;
const googleServicesFile = process.env.GOOGLE_SERVICES_FILE;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Six Frites",
  slug: "six-frites",
  scheme: "sixfrites",
  version: "1.3.1",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  backgroundColor: "#fafaf9",
  ios: {
    bundleIdentifier: "com.sixfrites.app",
    supportsTablet: true,
  },
  android: {
    package: "com.sixfrites.app",
    versionCode: 5,
    adaptiveIcon: {
      backgroundColor: "#F2711C",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    softwareKeyboardLayoutMode: "resize",
    predictiveBackGestureEnabled: false,
    ...(googleServicesFile && { googleServicesFile }),
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-image",
    "expo-video",
    "expo-sharing",
    ["expo-notifications", { icon: "./assets/android-icon-monochrome.png", color: "#eb8a00" }],
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        imageWidth: 120,
        backgroundColor: "#fafaf9",
        dark: { image: "./assets/splash-icon.png", backgroundColor: "#0c0a09" },
      },
    ],
    [
      "expo-audio",
      { microphonePermission: "Allow $(PRODUCT_NAME) to record voice messages." },
    ],
    [
      "expo-camera",
      {
        cameraPermission: "Allow $(PRODUCT_NAME) to take photos and record video messages.",
        microphonePermission: "Allow $(PRODUCT_NAME) to record sound for video messages.",
        recordAudioAndroid: true,
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "Allow $(PRODUCT_NAME) to send photos and videos from your library.",
        cameraPermission: "Allow $(PRODUCT_NAME) to take photos to send.",
      },
    ],
    [
      "@config-plugins/react-native-webrtc",
      {
        cameraPermission: "Allow $(PRODUCT_NAME) to use the camera for video calls.",
        microphonePermission: "Allow $(PRODUCT_NAME) to use the microphone for calls.",
      },
    ],
    ["expo-build-properties", { android: { minSdkVersion: 26, extraProguardRules: "-keep class org.webrtc.** { *; }\n-dontwarn org.webrtc.**" } }],
    ...(iosUrlScheme ? [["react-native-nitro-google-signin", { iosUrlScheme }] as [string, object]] : []),
  ],
  experiments: {
    typedRoutes: true,
  },
});
