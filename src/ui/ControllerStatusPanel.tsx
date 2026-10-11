import type { ControllerStatus } from '../input';
import type { Language } from '../shared/types';

export function ControllerStatusPanel({ status, language }: { status: ControllerStatus; language: Language }) {
 const es = language === 'es';
 return <section className="controller-status" aria-label={es ? 'Controles conectados' : 'Connected controllers'}>
  <strong>✚ {es ? 'CONTROLES' : 'CONTROLLERS'}</strong>
  {!status.available || status.blocked ? <p>{es ? 'Este navegador no permite usar controles en esta página. Abre el juego directamente en Arc, Chrome, Firefox o Safari.' : 'This browser does not allow controllers on this page. Open the game directly in Arc, Chrome, Firefox or Safari.'}</p> : status.controllers.length ? <>
   {status.controllers.map(controller => <div key={controller.id}><b>{controller.label}</b><span>{es ? 'Conectado' : 'Connected'}{controller.lastInput ? ` · ${controller.lastInput}` : ''}</span></div>)}
   <p>{es ? 'Cruceta / stick: elegir · ✕ / A: confirmar · ○ / B: volver · Options / Start: pausa. El control de cada luchador se elige en la sala.' : 'D-pad / stick: choose · ✕ / A: confirm · ○ / B: back · Options / Start: pause. Choose each fighter’s controller in the lobby.'}</p>
  </> : <p>{es ? 'Conecta tu control y presiona un botón con el juego en primer plano.' : 'Connect your controller and press a button with the game focused.'}</p>}
 </section>;
}
