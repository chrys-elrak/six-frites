import {
  type EphemeralInput,
  type GeoPoint,
  type PlaceSuggestionDTO,
  type TravelMode,
  coordsLabel,
  directionsUrl,
  distanceLabel,
  distanceMeters,
  mapTiles,
  mapsUrl,
  project,
  unproject,
} from "@six/shared";
import { SixApiError, unwrap } from "@six/sdk";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import { Car, Footprints, Layers, LocateFixed, MapPin, Minus, Navigation, Plus, Search, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  type StyleProp,
  StyleSheet,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { create } from "zustand";
import { EphemeralPicker } from "./ephemeral-picker";
import { Modal } from "./modal";
import { Sheet } from "./sheet";
import { Text } from "./text";
import { alpha, useBubbleColors } from "@/lib/bubble-colors";
import { getLocale, useT } from "@/lib/i18n";
import { WEB_URL, six } from "@/lib/six";
import { brand, brandInk, useTheme } from "@/lib/theme";

const TILE_HEADERS = { "User-Agent": "SixFrites/1.0 (Android)" };
/** The public Google Maps key the build was made with; without one, places show on OpenStreetMap. */
const MAPS_KEY: string | null = Constants.expoConfig?.extra?.googleMapsKey ?? null;
const Maps: typeof import("react-native-maps") | null = MAPS_KEY ? require("react-native-maps") : null;
const camera = (p: GeoPoint, zoom: number) => ({ center: { latitude: p.lat, longitude: p.lng }, zoom, heading: 0, pitch: 0 });
const MIN_ZOOM = 2;
const MAX_ZOOM = 19;

/** Ties the suggestions of one search to the place picked, which is how Google bills them. */
const newSession = () => `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

interface Here {
  at: GeoPoint | null;
  when: number;
  problem: "denied" | "failed" | null;
  asking: boolean;
}

/** Where we are, shared by every place on screen so each can say how far away it is. */
const useHere = create<Here>(() => ({ at: null, when: 0, problem: null, asking: false }));

/** Finds where we are, at most every five minutes. Only `ask` may prompt for permission; otherwise it needs it already. */
function locateMe(ask: boolean) {
  const { when, asking } = useHere.getState();
  if (asking || Date.now() - when < 5 * 60_000) return;
  void (async () => {
    if (!ask) {
      const allowed = await import("expo-location").then((L) => L.getForegroundPermissionsAsync()).catch(() => null);
      if (!allowed?.granted) return;
    }
    useHere.setState({ asking: true });
    try {
      useHere.setState({ at: await currentPosition(), when: Date.now(), problem: null });
    } catch (e) {
      useHere.setState({ problem: (e as Error).message === "denied" ? "denied" : "failed" });
    } finally {
      useHere.setState({ asking: false });
    }
  })();
}

export function LocationCard({ point, mine }: { point: GeoPoint; mine: boolean }) {
  const t = useTheme();
  const tr = useT();
  const bubble = useBubbleColors();
  const [open, setOpen] = useState(false);
  const [directions, setDirections] = useState(false);
  const { at, asking } = useHere();
  useEffect(() => locateMe(false), []);
  const directTo = () => openDirections(point, () => setDirections(true));
  const fg = mine ? bubble.ink : (bubble.theirInk ?? t.text);
  const accent = mine ? bubble.ink : brand;
  const pill = [styles.pill, { backgroundColor: mine ? alpha(bubble.ink, 0.12) : "rgba(235,138,0,0.15)" }];

  return (
    <View style={styles.card}>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button">
        {Maps ? (
          <View pointerEvents="none" style={[styles.preview, { overflow: "hidden", backgroundColor: t.border }]}>
            <Maps.default
              liteMode
              style={StyleSheet.absoluteFill}
              initialRegion={{ latitude: point.lat, longitude: point.lng, latitudeDelta: 0.005, longitudeDelta: 0.011 }}
              toolbarEnabled={false}
            >
              <Maps.Marker coordinate={{ latitude: point.lat, longitude: point.lng }} />
            </Maps.default>
          </View>
        ) : (
          <TileMap center={point} style={styles.preview} />
        )}
        <Text numberOfLines={1} style={{ color: fg, fontSize: 15, fontWeight: "600", marginTop: 6 }}>
          {point.name ?? tr.summary.kinds.location}
        </Text>
        <Text numberOfLines={1} style={{ color: fg, fontSize: 13, opacity: 0.75 }}>
          {at ? tr.messages.away(distanceLabel(distanceMeters(at, point))) : coordsLabel(point)}
          {point.accuracy ? ` · ${tr.messages.within(Math.round(point.accuracy))}` : ""}
        </Text>
      </Pressable>
      <View style={styles.pills}>
        <Pressable onPress={directTo} accessibilityRole="button" style={pill}>
          <Navigation size={16} color={accent} />
          <Text style={{ color: accent, fontSize: 13, fontWeight: "600" }}>{tr.messages.directions}</Text>
        </Pressable>
        {!at && (
          <Pressable onPress={() => locateMe(true)} disabled={asking} accessibilityRole="button" style={[pill, asking && { opacity: 0.5 }]}>
            <LocateFixed size={16} color={accent} />
            <Text style={{ color: accent, fontSize: 13, fontWeight: "600" }}>{tr.messages.distance}</Text>
          </Pressable>
        )}
      </View>
      {open && <LocationSheet point={point} onDirections={directTo} onClose={() => setOpen(false)} />}
      {directions && <DirectionsView point={point} onClose={() => setDirections(false)} />}
    </View>
  );
}

/** OpenStreetMap around `center`, filling its box, with a pin in the middle. */
export function TileMap({ center, zoom = 15, style }: { center: GeoPoint; zoom?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });
  return (
    <View onLayout={(e) => setSize(e.nativeEvent.layout)} style={[{ overflow: "hidden", backgroundColor: t.border }, style]}>
      {size.width > 0 &&
        mapTiles(center, size.width, size.height, zoom).map((m) => (
          <Image key={m.url} source={{ uri: m.url, headers: TILE_HEADERS }} style={[styles.tile, { left: m.x, top: m.y }]} />
        ))}
      <View style={[styles.pin, { left: size.width / 2 - 18, top: size.height / 2 - 36 }]} pointerEvents="none">
        <MapPin size={36} color="#fff" fill="#ef4444" />
      </View>
      <Text style={styles.credit} pointerEvents="none">
        © OpenStreetMap
      </Text>
    </View>
  );
}

/** The place on a map, its name and how far it is from us. */
export function LocationDetails({ point, color }: { point: GeoPoint; color?: string }) {
  const t = useTheme();
  const tr = useT();
  const ink = color ?? t.text;
  const [satellite, setSatellite] = useState(false);
  const { at, problem, asking } = useHere();
  useEffect(() => locateMe(false), []);

  return (
    <View style={{ gap: 6 }}>
      {Maps ? (
        <View>
          <Maps.default
            style={{ height: 200 }}
            initialCamera={camera(point, 16)}
            mapType={satellite ? "hybrid" : "standard"}
            toolbarEnabled={false}
          >
            <Maps.Marker coordinate={{ latitude: point.lat, longitude: point.lng }} />
          </Maps.default>
          <LayerButton satellite={satellite} onPress={() => setSatellite(!satellite)} style={{ position: "absolute", top: 8, right: 8 }} />
        </View>
      ) : (
        <TileMap center={point} style={{ height: 200 }} />
      )}
      {point.name && (
        <Text numberOfLines={2} style={{ color: ink, fontSize: 16, fontWeight: "600", textAlign: "center", paddingHorizontal: 16 }}>
          {point.name}
        </Text>
      )}
      <Text style={{ color: ink, opacity: 0.6, fontSize: 13, textAlign: "center" }}>
        {coordsLabel(point)}
        {point.accuracy ? ` · ${tr.messages.within(Math.round(point.accuracy))}` : ""}
      </Text>
      {at || problem ? (
        <Text
          style={{
            color: at ? ink : t.danger,
            fontSize: 15,
            fontWeight: "600",
            textAlign: "center",
            paddingHorizontal: 16,
          }}
        >
          {at
            ? tr.messages.away(distanceLabel(distanceMeters(at, point)))
            : problem === "denied"
              ? tr.composer.locationDenied
              : tr.composer.locationFailed}
        </Text>
      ) : (
        <Pressable onPress={() => locateMe(true)} disabled={asking} accessibilityRole="button" style={{ alignSelf: "center", opacity: asking ? 0.5 : 1 }}>
          <Text style={{ color: brand, fontSize: 15, fontWeight: "600" }}>{tr.messages.distanceFromMe}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Shows directions to the place in the app, on Google's free embedded map, or in Google Maps without a key. */
export function openDirections(point: GeoPoint, inApp: () => void) {
  if (MAPS_KEY) inApp();
  else void Linking.openURL(directionsUrl(point));
}

const framed = (src: string) =>
  `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,iframe{margin:0;width:100%;height:100%;border:0}</style></head><body><iframe src="${src.replaceAll("&", "&amp;")}" allowfullscreen></iframe></body></html>`;

/** The way from where we are to the place, by car or on foot, with a hand-off to Google Maps to be guided. */
export function DirectionsView({ point, onClose }: { point: GeoPoint; onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const { at, problem } = useHere();
  const [mode, setMode] = useState<TravelMode>("driving");
  useEffect(() => locateMe(true), []);
  const { WebView } = require("react-native-webview") as typeof import("react-native-webview");
  const src =
    at &&
    `https://www.google.com/maps/embed/v1/directions?${new URLSearchParams({
      key: MAPS_KEY!,
      origin: `${at.lat},${at.lng}`,
      destination: `${point.lat},${point.lng}`,
      mode,
      language: getLocale() === "mg" ? "fr" : getLocale(),
    })}`;

  return (
    <Modal animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.surface, paddingTop: insets.top }}>
        <View style={styles.top}>
          <Pressable onPress={onClose} accessibilityLabel={tr.common.close} hitSlop={8} style={styles.close}>
            <X size={24} color={t.text} />
          </Pressable>
          <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: "600" }}>
            {point.name ?? tr.summary.kinds.location}
          </Text>
          <View style={[styles.modes, { backgroundColor: t.field }]}>
            {(["driving", "walking"] as const).map((m) => {
              const on = mode === m;
              const Icon = m === "driving" ? Car : Footprints;
              return (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.mode, on && { backgroundColor: t.surface, elevation: 2 }]}
                >
                  <Icon size={16} color={on ? t.text : t.muted} />
                  <Text style={{ color: on ? t.text : t.muted, fontSize: 13, fontWeight: "600" }}>{tr.messages[m]}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={{ flex: 1, backgroundColor: t.border }}>
          {src ? (
            <WebView
              source={{ html: framed(src), baseUrl: WEB_URL }}
              style={{ flex: 1 }}
              onShouldStartLoadWithRequest={(r) => {
                if (r.isTopFrame === false || r.url.startsWith(WEB_URL) || r.url === "about:blank") return true;
                void Linking.openURL(r.url);
                return false;
              }}
            />
          ) : (
            <Text style={[styles.note, { color: t.muted, marginTop: 32 }]}>
              {problem === "denied" ? tr.composer.locationDenied : problem ? tr.composer.locationFailed : tr.messages.findingYou}
            </Text>
          )}
        </View>
        <View style={{ padding: 12, paddingBottom: Math.max(insets.bottom, 12) }}>
          <Pressable
            onPress={() => void Linking.openURL(directionsUrl(point, mode))}
            accessibilityRole="link"
            style={[styles.send, { flex: 0, flexDirection: "row", gap: 8, backgroundColor: brand }]}
          >
            <Navigation size={20} color={brandInk} />
            <Text style={{ color: brandInk, fontSize: 16, fontWeight: "700" }}>{tr.messages.startInGoogleMaps}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function LocationSheet({ point, onDirections, onClose }: { point: GeoPoint; onDirections: () => void; onClose: () => void }) {
  const tr = useT();
  const link = mapsUrl(point);
  return (
    <Sheet
      onClose={onClose}
      actions={[
        { label: tr.messages.directions, onSelect: onDirections },
        { label: tr.messages.openInMaps, onSelect: () => void Linking.openURL(link) },
        {
          label: tr.messages.saveLocation,
          onSelect: () => void Share.share({ message: point.name ? `${point.name}\n${link}` : link }).catch(() => null),
        },
        { label: tr.messages.copyCoords, onSelect: () => void Clipboard.setStringAsync(coordsLabel(point)) },
      ]}
      header={
        <View style={{ marginHorizontal: -16, marginTop: -12 }}>
          <LocationDetails point={point} />
        </View>
      }
    />
  );
}

/** Switches a Google map between the plain map and the satellite view. */
function LayerButton({ satellite, onPress, style }: { satellite: boolean; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const tr = useT();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.layers, { backgroundColor: t.surface }, style]}>
      <Layers size={16} color={t.text} />
      <Text style={{ color: t.text, fontSize: 13, fontWeight: "600" }}>{satellite ? tr.messages.mapView : tr.messages.satellite}</Text>
    </Pressable>
  );
}

/**
 * Picks a place to send: where we are, or anywhere found by moving the map or searching. Search goes through our
 * API, which allows each person a few a day.
 */
export function LocationPicker({
  initialEphemeral,
  onSend,
  onClose,
}: {
  initialEphemeral: EphemeralInput | null;
  onSend: (point: GeoPoint, ephemeral: EphemeralInput | null) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const [center, setCenter] = useState<GeoPoint>({ lat: 0, lng: 20 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [name, setName] = useState<string | undefined>();
  const [me, setMe] = useState<GeoPoint | null>(null);
  const [ephemeral, setEphemeral] = useState(initialEphemeral);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<PlaceSuggestionDTO[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [session, setSession] = useState(newSession);
  const typed = useRef("");
  const [satellite, setSatellite] = useState(false);
  const google = useRef<import("react-native-maps").default>(null);

  const goTo = (p: GeoPoint, z: number) => {
    setCenter(p);
    setZoom(z);
    google.current?.animateCamera(camera(p, z), { duration: 400 });
  };
  const drag = useRef({ x: 0, y: 0, from: { x: 0, y: 0 } });

  const locate = () =>
    currentPosition().then(
      (p) => {
        setMe(p);
        goTo(p, 16);
        setName(undefined);
      },
      (e: Error) => setNote(e.message === "denied" ? tr.composer.locationDenied : tr.composer.locationFailed),
    );

  useEffect(() => void locate(), []);

  async function suggest(q: string) {
    if (q.length < 2) return;
    setNote(null);
    const near = zoom > 6 ? { lat: center.lat, lng: center.lng } : {};
    try {
      const res = unwrap(await six.api.GET("/v1/place-suggest", { params: { query: { q, session, locale: getLocale(), ...near } } }));
      if (typed.current !== q) return;
      setFound(res.suggestions);
      setNote(res.suggestions.length ? tr.composer.searchesLeft(res.left) : tr.composer.noPlaces);
    } catch (err) {
      if (typed.current !== q) return;
      setFound(null);
      setNote(err instanceof SixApiError && err.code === "PLACE_SEARCH_LIMIT_REACHED" ? tr.composer.placeSearchLimit : tr.composer.placesUnavailable);
    }
  }

  useEffect(() => {
    const q = query.trim();
    typed.current = q;
    if (q.length < 2) return;
    const timer = setTimeout(() => void suggest(q), 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function pick(p: PlaceSuggestionDTO) {
    setFound(null);
    try {
      goTo(unwrap(await six.api.GET("/v1/place-details", { params: { query: { id: p.id, session, locale: getLocale() } } })), 17);
      setName(p.name);
    } catch {
      setNote(tr.composer.placesUnavailable);
    }
    setSession(newSession());
  }

  const round = [styles.round, { backgroundColor: t.surface }];

  return (
    <Modal animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.surface, paddingTop: insets.top }}>
        <View style={styles.top}>
          <Pressable onPress={onClose} accessibilityLabel={tr.common.close} hitSlop={8} style={styles.close}>
            <X size={24} color={t.text} />
          </Pressable>
          <View style={[styles.search, { backgroundColor: t.field }]}>
            <Search size={16} color={t.faint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => void suggest(query.trim())}
              placeholder={tr.composer.searchPlaces}
              placeholderTextColor={t.faint}
              returnKeyType="search"
              style={{ flex: 1, color: t.text, fontSize: 16, paddingVertical: 8 }}
            />
          </View>
        </View>
        {note && <Text style={[styles.note, { color: t.muted }]}>{note}</Text>}
        <View style={{ flex: 1 }}>
          {Maps ? (
            <>
              <Maps.default
                ref={google}
                style={StyleSheet.absoluteFill}
                initialCamera={camera(center, zoom)}
                mapType={satellite ? "hybrid" : "standard"}
                toolbarEnabled={false}
                showsUserLocation={!!me}
                showsMyLocationButton={false}
                onPanDrag={() => {
                  setName(undefined);
                  setFound(null);
                }}
                onRegionChangeComplete={(r) => {
                  setCenter({ lat: r.latitude, lng: r.longitude });
                  setZoom(Math.log2(360 / r.longitudeDelta));
                }}
              />
              <View pointerEvents="none" style={styles.centerPin}>
                <MapPin size={36} color="#fff" fill="#ef4444" />
              </View>
            </>
          ) : (
            <View
              style={StyleSheet.absoluteFill}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={(e) => {
                drag.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, from: project(center, zoom) };
                setFound(null);
              }}
              onResponderMove={(e) => {
                const d = drag.current;
                setCenter(unproject(d.from.x - (e.nativeEvent.pageX - d.x), d.from.y - (e.nativeEvent.pageY - d.y), zoom));
                setName(undefined);
              }}
            >
              <TileMap center={center} zoom={zoom} style={{ flex: 1 }} />
            </View>
          )}
          {found && found.length > 0 && query.trim().length >= 2 && (
            <ScrollView style={[styles.found, { backgroundColor: t.surface }]} keyboardShouldPersistTaps="handled">
              {found.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => void pick(p)}
                  style={({ pressed }) => [styles.place, pressed && { backgroundColor: t.pressed }]}
                >
                  <Text numberOfLines={1} style={{ color: t.text, fontSize: 15, fontWeight: "600" }}>
                    {p.name}
                  </Text>
                  {p.address && (
                    <Text numberOfLines={1} style={{ color: t.muted, fontSize: 12 }}>
                      {p.address}
                    </Text>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          )}
          <View style={styles.mapButtons}>
            {Maps && <LayerButton satellite={satellite} onPress={() => setSatellite(!satellite)} />}
            <Pressable onPress={() => void locate()} accessibilityLabel={tr.composer.myLocation} style={round}>
              <LocateFixed size={22} color={t.text} />
            </Pressable>
            <Pressable onPress={() => goTo(center, Math.min(MAX_ZOOM, Math.round(zoom) + 1))} accessibilityLabel={tr.composer.zoomIn} style={round}>
              <Plus size={22} color={t.text} />
            </Pressable>
            <Pressable onPress={() => goTo(center, Math.max(MIN_ZOOM, Math.round(zoom) - 1))} accessibilityLabel={tr.composer.zoomOut} style={round}>
              <Minus size={22} color={t.text} />
            </Pressable>
          </View>
        </View>
        <View style={{ padding: 12, gap: 8, paddingBottom: Math.max(insets.bottom, 12) }}>
          {name && (
            <Text numberOfLines={1} style={{ color: t.text, fontSize: 15, fontWeight: "600", textAlign: "center" }}>
              {name}
            </Text>
          )}
          <Text style={{ color: t.muted, fontSize: 13, textAlign: "center" }}>{coordsLabel(center)}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <EphemeralPicker value={ephemeral} onChange={setEphemeral} compact />
            <Pressable
              onPress={() => onSend({ lat: center.lat, lng: center.lng, ...(name && { name }) }, ephemeral)}
              disabled={zoom < 10}
              accessibilityRole="button"
              style={[styles.send, { backgroundColor: brand, opacity: zoom < 10 ? 0.4 : 1 }]}
            >
              <Text style={{ color: brandInk, fontSize: 16, fontWeight: "700" }}>{tr.composer.sendThisPlace}</Text>
            </Pressable>
          </View>
          {me && (
            <Pressable
              onPress={() => onSend(me, ephemeral)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.send, { backgroundColor: pressed ? t.pressed : t.field }]}
            >
              <Text style={{ color: t.text, fontSize: 16, fontWeight: "600" }}>
                {tr.composer.sendMyLocation}
                {me.accuracy ? ` · ${tr.messages.within(Math.round(me.accuracy))}` : ""}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

/**
 * Where the phone is now. Rejects with "denied" when location access was refused. The module loads
 * here rather than at the top so builds made before it was added still open chats.
 */
export async function currentPosition(): Promise<GeoPoint> {
  const Location = await import("expo-location").catch(() => {
    throw new Error("failed");
  });
  const { granted } = await Location.requestForegroundPermissionsAsync();
  if (!granted) throw new Error("denied");
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => {
    throw new Error("failed");
  });
  return {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    accuracy: p.coords.accuracy === null ? null : Math.min(Math.round(p.coords.accuracy), 100_000),
  };
}

const styles = StyleSheet.create({
  card: { width: 256, maxWidth: "100%", paddingVertical: 4 },
  preview: { height: 128, borderRadius: 12 },
  pills: { flexDirection: "row", gap: 6, marginTop: 6 },
  pill: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 999, paddingVertical: 7 },
  tile: { position: "absolute", width: 256, height: 256 },
  pin: { position: "absolute" },
  credit: {
    position: "absolute",
    right: 0,
    bottom: 0,
    paddingHorizontal: 4,
    fontSize: 10,
    color: "#57534e",
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  top: { flexDirection: "row", alignItems: "center", gap: 8, padding: 8 },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  search: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 999, paddingHorizontal: 12 },
  note: { fontSize: 12, textAlign: "center", paddingHorizontal: 16, paddingBottom: 8 },
  found: { position: "absolute", left: 8, right: 8, top: 8, maxHeight: "60%", borderRadius: 12, elevation: 6 },
  place: { paddingHorizontal: 16, paddingVertical: 10 },
  mapButtons: { position: "absolute", right: 12, bottom: 24, gap: 8, alignItems: "flex-end" },
  modes: { flexDirection: "row", borderRadius: 999, padding: 2 },
  mode: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  centerPin: { position: "absolute", left: "50%", top: "50%", marginLeft: -18, marginTop: -36 },
  layers: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    elevation: 4,
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  send: { flex: 1, minHeight: 46, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
});
