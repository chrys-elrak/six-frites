import type { ConfigContext, ExpoConfig } from "expo/config";

const iosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Six Frites",
  slug: "six-frites",
  scheme: "sixfrites",
  version: "1.0.0",
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
    adaptiveIcon: {
      backgroundColor: "#F2711C",
      foregroundImage: "./assets/android-icon-foreground.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    softwareKeyboardLayoutMode: "resize",
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-image",
    "expo-video",
    "expo-sharing",
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
    ["expo-build-properties", { android: { minSdkVersion: 26 } }],
    ...(iosUrlScheme ? [["react-native-nitro-google-signin", { iosUrlScheme }] as [string, object]] : []),
  ],
  experiments: {
    typedRoutes: true,
  },
});
