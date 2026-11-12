import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { Modal as NativeModal, type ModalProps, Platform, View } from "react-native";

const CLOSING_MS = 700;
const GIVE_UP_MS = 3000;

const ROOT = {};
const Parent = createContext<object>(ROOT);
const lines = new WeakMap<object, object[]>();
const watchers = new Set<() => void>();

function watch(watcher: () => void) {
  watchers.add(watcher);
  return () => void watchers.delete(watcher);
}

function changed() {
  watchers.forEach((w) => w());
}

/**
 * iOS shows one modal at a time and silently drops one opened while another is up or still closing. The dropped one
 * would stay invisible over the whole app and swallow every tap. So modals opened side by side line up and each
 * mounts when the one before it has closed, while a modal opened inside another gets that modal's own line. One iOS
 * still drops, say under the photo picker, is kept untouchable and goes back in line to ask again.
 *
 * ponytail: iOS never says a modal was dropped or has finished closing, so both are timed. Side by side means one
 * after the other, never stacked: move the call and lock screens to a FullWindowOverlay if they must cover a dialog.
 */
function PatientModal({ visible = true, onShow, children, ...props }: ModalProps) {
  const parent = useContext(Parent);
  const [me] = useState(() => ({}));
  const [asked, setAsked] = useState(0);
  const [shown, setShown] = useState(false);
  const mine = useSyncExternalStore(watch, () => lines.get(parent)?.[0] === me);
  if (!mine && shown) setShown(false);

  useEffect(() => {
    if (!visible) return;
    const line = lines.get(parent) ?? [];
    lines.set(parent, line);
    line.push(me);
    changed();
    return () => {
      const closing = {};
      line[line.indexOf(me)] = closing;
      setTimeout(() => {
        line.splice(line.indexOf(closing), 1);
        changed();
      }, CLOSING_MS);
    };
  }, [visible, parent, me, asked]);

  useEffect(() => {
    if (!mine || shown) return;
    const id = setTimeout(() => setAsked((n) => n + 1), GIVE_UP_MS);
    return () => clearTimeout(id);
  }, [mine, shown]);

  if (!mine) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute" }}>
      <NativeModal
        {...props}
        visible
        onShow={(e) => {
          setShown(true);
          onShow?.(e);
        }}
      >
        <Parent.Provider value={me}>{children}</Parent.Provider>
      </NativeModal>
    </View>
  );
}

export const Modal = Platform.OS === "ios" ? PatientModal : NativeModal;
