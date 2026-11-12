import type { ConfigContext, ExpoConfig } from "expo/config";
import { type ConfigPlugin, withAndroidManifest } from "expo/config-plugins";

const iosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME;
const googleServicesFile = process.env.GOOGLE_SERVICES_FILE;
const iosGoogleServicesFile = process.env.GOOGLE_SERVICES_FILE_IOS;
const playStore = process.env.PLAY_STORE === "1";
const googleMapsKey = process.env.GOOGLE_MAPS_PUBLIC_KEY;
/**
 * Links to these pages of the website open in the app when it's installed. The site vouches for it in
 * /.well-known/assetlinks.json (Android) and /.well-known/apple-app-site-association (iOS), which list the same pages.
 */
const APP_LINK_HOST = "six-frites.koera.mg";
const APP_LINK_PAGES = ["/", "/inbox", "/contacts", "/notifications", "/settings", "/archived", "/tips"];
const APP_LINK_PREFIXES = ["/chats/", "/invite/", "/add/", "/g/", "/play/"];

/**
 * Google Sign-In's Swift pods only link statically with modular headers on these. The sign-in plugin adds them itself,
 * but it only runs once GOOGLE_IOS_URL_SCHEME is set, so the iOS build needs them from here until then.
 */
const googleSignInPods = ["AppCheckCore", "GoogleUtilities", "RecaptchaInterop"].map((name) => ({ name, modular_headers: true }));

/**
 * Google Maps marks OpenGL ES 2.0 as required. Every Android phone has it, but Play's device catalogue lists a few
 * without it and drops them, so the app's manifest makes it optional again.
 */
const optionalOpenGl: ConfigPlugin = (config) =>
  withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest;
    manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
    const openGl = { $: { "android:glEsVersion": "0x00020000", "android:required": "false", "tools:replace": "android:required" } };
    manifest["uses-feature"] = [...(manifest["uses-feature"] ?? []), openGl as never];
    return c;
  });

export default ({ config }: ConfigContext): ExpoConfig =>
  optionalOpenGl({
  ...config,
  name: "Six Frites",
  slug: "six-frites",
  scheme: "sixfrites",
  version: "1.6.0",
  orientation: "default",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  backgroundColor: "#fafaf9",
  ios: {
    bundleIdentifier: "com.sixfrites.app",
    ...(iosGoogleServicesFile && { googleServicesFile: iosGoogleServicesFile }),
    supportsTablet: true,
    associatedDomains: [`applinks:${APP_LINK_HOST}`],
    usesAppleSignIn: true,
  },
  android: {
    package: "com.sixfrites.app",
    versionCode: 10,
    adaptiveIcon: {
      backgroundColor: "#F2711C",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    softwareKeyboardLayoutMode: "resize",
    predictiveBackGestureEnabled: false,
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        category: ["BROWSABLE", "DEFAULT"],
        data: [
          ...APP_LINK_PAGES.map((path) => ({ scheme: "https", host: APP_LINK_HOST, path })),
          ...APP_LINK_PREFIXES.map((pathPrefix) => ({ scheme: "https", host: APP_LINK_HOST, pathPrefix })),
        ],
      },
    ],
    ...(googleServicesFile && { googleServicesFile }),
    ...(playStore && {
      blockedPermissions: [
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_MEDIA_VIDEO",
        "android.permission.READ_MEDIA_AUDIO",
        "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
      ],
    }),
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-apple-authentication",
    ["expo-local-authentication", { faceIDPermission: "Allow $(PRODUCT_NAME) to unlock with Face ID." }],
    ["expo-location", { locationWhenInUsePermission: "Allow $(PRODUCT_NAME) to send your location when you choose to." }],
    "expo-image",
    "expo-video",
    "expo-sharing",
    [
      "expo-notifications",
      {
        icon: "./assets/android-icon-monochrome.png",
        color: "#eb8a00",
        sounds: ["frites", "chime", "pop", "ding", "marimba", "drop", "trio", "blip"].map((tone) => `./assets/tones/${tone}.wav`),
      },
    ],
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
    [
      "expo-font",
      {
        android: {
          fonts: [
            {
              fontFamily: "Inter",
              path: "./assets/fonts/Inter-Variable.ttf",
              fontDefinitions: [{ weight: 400 }, { weight: 500 }, { weight: 600 }, { weight: 700 }],
            },
          ],
        },
      },
    ],
    [
      "expo-build-properties",
      {
        android: { minSdkVersion: 26, buildArchs: ["armeabi-v7a", "arm64-v8a"], useLegacyPackaging: true, extraProguardRules: "-keep class org.webrtc.** { *; }\n-dontwarn org.webrtc.**" },
        ...(!iosUrlScheme && { ios: { extraPods: googleSignInPods } }),
      },
    ],
    ...(iosUrlScheme ? [["react-native-nitro-google-signin", { iosUrlScheme }] as [string, object]] : []),
    ...(googleMapsKey ? [["react-native-maps", { androidGoogleMapsApiKey: googleMapsKey }] as [string, object]] : []),
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: { playStore, googleMapsKey: googleMapsKey ?? null },
  });
