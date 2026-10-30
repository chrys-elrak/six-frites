import { useLocalSearchParams } from "expo-router";
import { LiveRoom } from "@/components/live-room";

export default function PlayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LiveRoom key={id} id={id} />;
}
