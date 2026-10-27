/**
 * Lets a video message keep recording when it switches between the front and back camera. expo-camera
 * rebuilds its CameraX use cases on every flip, which ends the recording; a persistent recording that
 * keeps the same VideoCapture survives the rebind. Runs after every install and is safe to run twice.
 */
const fs = require("node:fs");
const path = require("node:path");

let file;
try {
  file = path.join(
    path.dirname(require.resolve("expo-camera/package.json")),
    "android/src/main/java/expo/modules/camera/ExpoCameraView.kt",
  );
} catch {
  process.exit(0);
}

const MARK = "// six-frites: persistent recording";
let src = fs.readFileSync(file, "utf8");
if (src.includes(MARK)) process.exit(0);

const edits = [
  [
    "  private var recorder: Recorder? = null\n",
    `  private var recorder: Recorder? = null\n  ${MARK}\n  private var videoCaptureUseCase: VideoCapture<Recorder>? = null\n`,
  ],
  [
    "  fun record(options: RecordingOptions, promise: Promise, cacheDirectory: File) {",
    '  @SuppressLint("UnsafeOptInUsageError")\n  fun record(options: RecordingOptions, promise: Promise, cacheDirectory: File) {',
  ],
  [
    "      activeRecording = it.prepareRecording(context, fileOutputOptions)\n",
    "      activeRecording = it.prepareRecording(context, fileOutputOptions)\n        .asPersistentRecording()\n",
  ],
  [
    "            is VideoRecordEvent.Finalize -> {\n",
    "            is VideoRecordEvent.Finalize -> {\n              activeRecording = null\n",
  ],
  [
    "    val videoCapture = createVideoCapture(selectedCameraInfo)\n",
    "    val videoCapture = videoCaptureUseCase?.takeIf { activeRecording != null }\n      ?: createVideoCapture(selectedCameraInfo).also { videoCaptureUseCase = it }\n",
  ],
  [
    "  fun cleanupCamera() {\n",
    "  fun cleanupCamera() {\n    activeRecording?.close()\n",
  ],
];

for (const [from, to] of edits) {
  if (!src.includes(from)) {
    throw new Error(`expo-camera changed and ${path.basename(__filename)} no longer applies: missing ${JSON.stringify(from)}`);
  }
  src = src.replace(from, to);
}
fs.writeFileSync(file, src);
console.log("patched expo-camera for persistent recording");
