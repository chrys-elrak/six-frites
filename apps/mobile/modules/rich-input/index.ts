import { type NativeModule, requireOptionalNativeModule } from "expo";

export interface ReceivedImage {
  uri: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  fromKeyboard: boolean;
}

declare class RichInputModule extends NativeModule<{ onImage: (image: ReceivedImage) => void }> {
  watch(viewTag: number): Promise<void>;
}

/** Android only (null elsewhere): lets a TextInput take pictures from the keyboard and from paste. */
export default requireOptionalNativeModule<RichInputModule>("RichInput");
