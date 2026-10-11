/** Keep browser standard mappings intact. Only normalize the known macOS HID shape.
 * Reference: Chromium device/gamepad/gamepad_standard_mappings_mac.mm MapperDualSense.
 */
export const isDualSense = (id: string) => /dualsense/i.test(id) || (/054c/i.test(id) && /0ce6|0df2/i.test(id));
export const controllerLabel = (pad: Gamepad) => isDualSense(pad.id) ? (/edge|0df2/i.test(pad.id) ? 'DualSense Edge' : 'DualSense') : pad.id;
export function normalizeController(pad: Gamepad): Gamepad {
  if (pad.mapping === 'standard' || !isDualSense(pad.id) || pad.buttons.length !== 14 || pad.axes.length !== 10) return pad;
  const button = (value: number): GamepadButton => ({value, pressed: value > .5, touched: value > 0});
  const buttons = [1,2,0,3,4,5].map(index => pad.buttons[index]);
  buttons.push(button((pad.axes[3] + 1) / 2), button((pad.axes[4] + 1) / 2));
  buttons.push(...[8,9,10,11].map(index => pad.buttons[index]));
  // HID hat values are -1, -5/7, -3/7, -1/7, 1/7, 3/7, 5/7, 1;
  // the neutral hat is outside [-1, 1].
  const hat = pad.axes[9];
  const direction = hat >= -1 && hat <= 1 ? Math.round((hat + 1) * 3.5) : -1;
  buttons.push(...[[0,1,7],[3,4,5],[5,6,7],[1,2,3]].map(values => button(values.includes(direction) ? 1 : 0)));
  buttons.push(pad.buttons[12], pad.buttons[13]);
  return {id:pad.id,index:pad.index,connected:pad.connected,timestamp:pad.timestamp,mapping:'standard',axes:[pad.axes[0],pad.axes[1],pad.axes[2],pad.axes[5]],buttons,vibrationActuator:pad.vibrationActuator};
}
