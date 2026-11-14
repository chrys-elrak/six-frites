const { AndroidConfig, withAndroidStyles } = require("expo/config-plugins");

/**
 * Stops Android, and Xiaomi's MIUI in particular, from darkening the app itself in dark mode: the app has its own
 * dark theme, and the forced one turns white buttons black and leaves screen captures half dark.
 */
module.exports = (config) =>
  withAndroidStyles(config, (c) => {
    c.modResults = AndroidConfig.Styles.assignStylesValue(c.modResults, {
      add: true,
      parent: AndroidConfig.Styles.getAppThemeGroup(),
      name: "android:forceDarkAllowed",
      value: "false",
    });
    return c;
  });
