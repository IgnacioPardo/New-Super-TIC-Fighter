# Controller input verification

Menus use fixed standard buttons: Cross/A (0) confirms, Circle/B (1) goes back, and Options/Start (9) opens pause. Combat bindings remain configurable. Menu navigation prefers the D-pad or the dominant left-stick direction and repeats after a short delay. Controller detection and last normalized input are exposed through `InputManager.getControllerStatus()`.

Standard browser mappings pass through unchanged. The fallback only handles a recognized DualSense/DualSense Edge with a nonstandard mapping and the macOS HID layout of 14 buttons and 10 axes. Its mapping follows [Chromium's macOS MapperDualSense](https://chromium.googlesource.com/chromium/src/+/7d1e648a5f/device/gamepad/gamepad_standard_mappings_mac.mm). Unknown layouts remain unmodified.

Run `STF_APP_URL=http://127.0.0.1:5173 node scripts/app-dualsense.mjs` against the running application. This uses injected controller data in isolated Chromium: standard and raw HID DualSense movement, pause, disconnect, different-device quarantine and same-device reclaim. Browser adapter exercises cover fixed menu buttons after remapping, dominant-direction repeat, partial combat bindings, focus loss/recovery, status reporting and keyboard operation when the Gamepad API throws.

These are simulated browser inputs, not physical Bluetooth/USB controller certification. A connected macOS device is not sufficient evidence that Arc exposes it through the Gamepad API. Physical verification must check the live controller status, actual button/stick activity, menu navigation and assigned fighter movement in the user's focused Arc session.
