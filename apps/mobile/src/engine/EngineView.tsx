import { Asset } from "expo-asset";
import { getInfoAsync } from "expo-file-system/legacy";
import { useEffect, useState, type RefObject } from "react";
import { Platform, View } from "react-native";
import { WebView as RNWebView, type WebViewProps } from "react-native-webview";
import type { ComponentType, Ref } from "react";
import { readAccessDirectory } from "./diagnostics";

const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<RNWebView> }>;

/**
 * Captures engine console errors before the bundle runs, and asks the page to
 * re-send hello/session. The page also repeats that announcement until acked,
 * so a message posted before this listener exists is not lost.
 */
const CONSOLE_HOOK = `(function(){
  function send(level, text){
    try {
      var payload = JSON.stringify({v:1,kind:"evt",event:"log",data:{level:level,message:String(text).slice(0,400)}});
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
    } catch (e) {}
  }
  ["error","warn"].forEach(function(level){
    var orig = console[level];
    console[level] = function(){
      var parts = [];
      for (var i = 0; i < arguments.length; i++) parts.push(String(arguments[i]));
      send(level, parts.join(" "));
      if (orig) return orig.apply(console, arguments);
    };
  });
  window.addEventListener("error", function(e){ send("error", (e && e.message) + " @" + (e && e.lineno)); });
  window.addEventListener("unhandledrejection", function(e){
    var reason = e && e.reason;
    send("error", "unhandled: " + (reason && reason.message ? reason.message : reason));
  });
})(); true;`;

const HOST_PING = "window.__imelloHostPing&&window.__imelloHostPing(); true;";

export interface EngineAssetInfo {
  uri: string;
  bytes: number;
}

/**
 * Invisible engine. The page is loaded from a file URL so WKWebView reads the
 * bundle from disk. Passing the 13MB document through the React Native bridge
 * as an HTML string never finishes on a real iPhone.
 * The view is small but on-screen: a 1px clipped WebView is not started on iOS 26.
 */
export function EngineView({
  webRef,
  onMessage,
  onAsset,
  onLoaded,
}: {
  webRef: RefObject<RNWebView | null>;
  onMessage: (raw: string) => void;
  onAsset: (info: EngineAssetInfo) => void;
  onLoaded: () => void;
}) {
  const [source, setSource] = useState<{ uri: string; read: string } | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const asset = Asset.fromModule(require("../../assets/engine/index.html"));
      if (!asset.localUri) await asset.downloadAsync();
      const uri = asset.localUri ?? asset.uri;
      if (!uri || !uri.startsWith("file:")) throw new Error("engine_not_file");
      const info = await getInfoAsync(uri);
      const bytes = info.exists && "size" in info && typeof info.size === "number" ? info.size : 0;
      if (bytes < 1000) throw new Error("engine_too_small");
      if (!live) return;
      onAsset({ uri, bytes });
      setSource({ uri, read: readAccessDirectory(uri) });
    })().catch((err: unknown) => {
      const message = err instanceof Error && /^[a-z0-9_]+$/i.test(err.message) ? err.message : "engine_missing";
      if (live) {
        onMessage(JSON.stringify({ v: 1, kind: "evt", event: "engine-error", data: { code: message, message } }));
      }
    });
    return () => {
      live = false;
    };
  }, [onAsset, onMessage]);

  if (!source) return null;
  return (
    <View
      collapsable={false}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", width: 120, height: 120, bottom: 0, right: 0, opacity: 0.02 }}
    >
      <WebView
        ref={webRef}
        source={{ uri: source.uri }}
        allowingReadAccessToURL={source.read}
        style={{ width: 120, height: 120 }}
        originWhitelist={["*", "file://*"]}
        javaScriptEnabled
        domStorageEnabled
        incognito={false}
        cacheEnabled
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        mixedContentMode="always"
        geolocationEnabled={false}
        setSupportMultipleWindows={false}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        injectedJavaScriptBeforeContentLoaded={CONSOLE_HOOK}
        injectedJavaScript={HOST_PING}
        textZoom={100}
        androidLayerType={Platform.OS === "android" ? "hardware" : undefined}
        onLoadEnd={() => {
          onLoaded();
          webRef.current?.injectJavaScript(HOST_PING);
        }}
        onMessage={(event) => onMessage(event.nativeEvent.data)}
        onError={(event) => {
          const message = (event.nativeEvent.description || "webview_error").slice(0, 200);
          onMessage(JSON.stringify({ v: 1, kind: "evt", event: "engine-error", data: { code: "webview_error", message } }));
        }}
        onContentProcessDidTerminate={() =>
          onMessage(JSON.stringify({ v: 1, kind: "evt", event: "engine-error", data: { code: "webview_terminated", message: "webview_terminated" } }))
        }
        onRenderProcessGone={() =>
          onMessage(JSON.stringify({ v: 1, kind: "evt", event: "engine-error", data: { code: "webview_terminated", message: "webview_terminated" } }))
        }
      />
    </View>
  );
}
