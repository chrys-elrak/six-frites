package expo.modules.richinput

import android.graphics.BitmapFactory
import android.net.Uri
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.webkit.MimeTypeMap
import androidx.core.view.ContentInfoCompat
import androidx.core.view.OnReceiveContentListener
import androidx.core.view.ViewCompat
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.UUID

class RichInputModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RichInput")
    Events("onImage")

    AsyncFunction("watch") { viewTag: Int ->
      val view = appContext.findView<View>(viewTag) ?: return@AsyncFunction
      ViewCompat.setOnReceiveContentListener(view, arrayOf("image/*"), receiver)
      view.context.getSystemService(InputMethodManager::class.java)?.restartInput(view)
    }.runOnQueue(Queues.MAIN)
  }

  /**
   * Takes the pictures a keyboard inserts (GIFs, stickers, its clipboard strip) or a paste carries, copies each
   * into the cache while the read permission lasts and hands it to JS. Text is returned to the input as usual.
   * ponytail: copies on the UI thread, fine for keyboard GIFs and screenshots; move off it if big pastes stutter.
   */
  private val receiver = OnReceiveContentListener { view, payload ->
    val resolver = view.context.contentResolver
    val described = payload.clip.description.let { d -> (0 until d.mimeTypeCount).map(d::getMimeType) }
    val mimeOf = { uri: Uri -> resolver.getType(uri) ?: described.firstOrNull { it.startsWith("image/") } }
    val split = payload.partition { item -> item.uri?.let(mimeOf)?.startsWith("image/") == true }
    val images = split.first
    val rest = split.second
    if (images == null) return@OnReceiveContentListener rest

    for (i in 0 until images.clip.itemCount) {
      val uri = images.clip.getItemAt(i).uri
      val mime = mimeOf(uri) ?: continue
      val ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime) ?: "img"
      val file = File(view.context.cacheDir, "pasted-${UUID.randomUUID()}.$ext")
      val copied = runCatching {
        resolver.openInputStream(uri)?.use { input -> file.outputStream().use { input.copyTo(it) } }
      }.getOrNull()
      if (copied == null) continue
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(file.path, bounds)
      sendEvent(
        "onImage",
        mapOf(
          "uri" to Uri.fromFile(file).toString(),
          "mime" to mime,
          "size" to file.length().toDouble(),
          "width" to bounds.outWidth,
          "height" to bounds.outHeight,
          "fromKeyboard" to (payload.source == ContentInfoCompat.SOURCE_INPUT_METHOD),
        ),
      )
    }
    rest
  }
}
