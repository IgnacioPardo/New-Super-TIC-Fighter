import type { AppSettings, AssetsManifest, Discipline, GameplayEvent, MatchSnapshot } from './shared/types';

export type UiSound = 'navigate' | 'confirm' | 'back' | 'change' | 'ready' | 'unready' | 'error' | 'pause' | 'resume' | 'open' | 'close' | 'start';
const asset = (name: string) => `/assets/audio/polish/${name}.wav`;
const UI: Record<UiSound, string> = {
  navigate: 'select_001', confirm: 'click_003', back: 'back_001', change: 'switch_002', ready: 'confirmation_002',
  unready: 'minimize_001', error: 'error_003', pause: 'minimize_001', resume: 'maximize_001', open: 'open_001', close: 'close_001', start: 'confirmation_002',
};
const IMPACTS = ['impactPunch_medium_000', 'impactPunch_medium_001', 'impactSoft_heavy_000', 'impactSoft_heavy_001', 'impactWood_light_000', 'impactSoft_medium_000'];
const pick = (names: string[]) => names[Math.floor(Math.random() * names.length)];
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const DISCIPLINE_AUDIO: Record<Discipline, { windup: string; active: string; contact: string; signature: string; rate: number }> = {
 networks: { windup:'Redes',active:'',contact:'Latigo',signature:'Hard',rate:1 },
 design: { windup:'',active:'Mouse',contact:'golpeMouse',signature:'Seleccion',rate:1 },
 code: { windup:'Prog',active:'',contact:'Bola',signature:'Programacion',rate:1 },
 hardware: { windup:'Hard',active:'RAM',contact:'',signature:'Disco',rate:1 },
 ai: { windup:'Prog',active:'switch_002',contact:'Bola',signature:'Programacion',rate:1.2 },
 robotics: { windup:'Hard',active:'RAM',contact:'impactWood_light_000',signature:'Disco',rate:.8 },
 iot: { windup:'switch_002',active:'open_001',contact:'UTP',signature:'confirmation_002',rate:1.1 },
 vr: { windup:'minimize_001',active:'maximize_001',contact:'Seleccion',signature:'Seleccion',rate:.85 },
 games: { windup:'click_003',active:'Mouse',contact:'Bola',signature:'confirmation_002',rate:1.35 },
 printing: { windup:'Hard',active:'RAM',contact:'impactSoft_heavy_001',signature:'RAM',rate:.7 },
};

/** Confirmed combat events, semantic UI cues, and streamed original music. */
export class AudioManager {
  private context?: AudioContext;
  private gain?: GainNode;
  private compressor?: DynamicsCompressorNode;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | undefined>>();
  private encoded = new Map<string, Promise<ArrayBuffer | undefined>>();
  private voices = new Set<AudioScheduledSourceNode>();
  private seen = new Set<string>();
  private recent = new Map<string, number>();
  private music = new Audio();
  private scene: 'menu' | 'match' | 'silent' = 'silent';
  private settings?: AppSettings;
  private playlist: string[] = [];
  private previousTrack = '';
  private previousSnapshot?: MatchSnapshot;
  private generation = 0;
  private paused = false;
  private duckUntil = 0;
  private duckTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;
  unlocked = false;

  constructor(private manifest: AssetsManifest) {
    this.music.preload = 'none';
    this.music.addEventListener('ended', this.nextTrack);
    document.addEventListener('visibilitychange', this.visibility);
    // Fetch the small effect bank early; decoding and playback wait for a gesture.
    for (const name of [...Object.keys(manifest.audio.effects), ...new Set(Object.values(UI)), ...IMPACTS]) this.fetchEncoded(name);
  }
  setSettings(settings: AppSettings) {
    const playlistChanged = this.settings?.playlist !== settings.playlist;
    this.settings = settings;
    this.updateMusicVolume();
    if (this.gain && this.context) this.gain.gain.setTargetAtTime(clamp(settings.effectsVolume), this.context.currentTime, .015);
    if (!settings.effectsVolume) { this.generation++; this.stopVoices(); }
    if (settings.musicVolume) this.playMusic(); else this.music.pause();
    if (playlistChanged) { this.playlist = []; if (this.scene === 'match') this.nextTrack(); }
  }
  async unlock(): Promise<void> {
    if (this.destroyed) return;
    this.ensureContext();
    try { await this.context!.resume(); this.unlocked = this.context!.state === 'running'; } catch { this.unlocked = false; }
    if (this.destroyed) return;
    if (this.unlocked) for (const name of this.encoded.keys()) void this.buffer(name);
    if (this.unlocked && this.scene !== 'silent') {
      if (!this.music.src) this.nextTrack();
      this.playMusic();
    }
  }
  /** Call during the trusted UI action. A tiny synthesized cue covers first-load decoding. */
  playUi(cue: UiSound): void {
    if (this.destroyed || document.hidden || !this.settings?.effectsVolume || !this.allow(`ui:${cue}`, cue === 'navigate' || cue === 'change' ? 75 : 110)) return;
    this.ensureContext();
    void this.unlock();
    const name = UI[cue];
    if (this.buffers.has(name)) void this.play(name, .32, 0, true, 1);
    else this.uiFallback(cue);
  }
  setScene(scene: 'menu' | 'match' | 'silent') {
    if (this.scene === scene) return;
    this.scene = scene;
    this.generation++;
    this.previousSnapshot = undefined;
    this.paused = false;
    this.recent.clear();
    this.stopVoices();
    this.duckUntil = 0;
    if (this.duckTimer) clearTimeout(this.duckTimer);
    this.updateMusicVolume();
    this.music.pause();
    if (scene === 'silent') return;
    if (scene === 'menu') { this.music.src = this.manifest.audio.menu; this.music.loop = true; this.playMusic(); }
    else { this.music.loop = false; this.nextTrack(); }
  }
  handleEvents(events: GameplayEvent[], snapshot?: MatchSnapshot) {
    if (snapshot) {
      const paused = snapshot.phase === 'paused';
      if (paused && !this.paused) { this.generation++; this.stopVoices(); }
      this.paused = paused;
    }
    if (snapshot && this.previousSnapshot?.matchId !== snapshot.matchId) { this.seen.clear(); this.previousSnapshot = undefined; }
    for (const event of events) {
      if (this.seen.has(event.id)) continue;
      this.seen.add(event.id);
      if (this.seen.size > 1024) this.seen.delete(this.seen.values().next().value!);
      // Events received during pause/reconciliation must never replay after resuming.
      if (this.scene !== 'match' || (snapshot && (snapshot.phase === 'paused' || snapshot.tick - event.tick > 12))) continue;
      const fighter = snapshot?.fighters.find(f => f.id === (event.targetId ?? event.seatId));
      const pan = fighter ? Math.max(-.55, Math.min(.55, (fighter.x / 1366 * 2 - 1) * .55)) : 0;
      const cue = (name: string, gain = .65, rate?: number) => void this.play(name, gain, pan, false, rate);
      if (event.type === 'fight') { cue('Fight', .85, 1); this.duck(650); }
      if (event.type === 'result') { cue(UI.ready, .55, .85); this.duck(650); }
      if (event.type === 'fall') cue('impactSoft_heavy_001', .75, .72);
      if (event.type === 'respawn') cue(UI.resume, .32, 1.1);
      if (event.type === 'block') cue('impactWood_light_000', .48);
      if (event.type === 'deploy') cue('open_001', .3, DISCIPLINE_AUDIO[event.discipline ?? 'iot'].rate);
      if (event.type === 'item') cue('confirmation_002', .4, 1.15);
      if (event.type === 'wave') { cue('maximize_001', .5, .8); this.duck(350); }
      if (event.type === 'hazard' && this.allow('hazard-cue', 400)) cue('impactSoft_heavy_001', .4, .65);
      if (event.type === 'hit') {
        const heavy = event.action === 'uppercut' || event.action === 'combo' || event.action === 'special';
        cue(pick(heavy ? ['impactSoft_heavy_000', 'impactSoft_heavy_001'] : ['impactPunch_medium_000', 'impactPunch_medium_001']), heavy ? .85 : .65);
        if (event.action === 'special') {
          const name = DISCIPLINE_AUDIO[event.discipline ?? 'hardware'].contact;
          if (name) cue(name, .55);
        }
      }
      if (event.type === 'active') {
        const voice = DISCIPLINE_AUDIO[event.discipline ?? 'networks'];
        const name = event.action === 'special' ? voice.active : event.action === 'combo' && !['networks','design'].includes(event.discipline ?? '') ? voice.signature : '';
        if (name) cue(name, .6, voice.rate);
      }
      if (event.type === 'attack') {
        // Windup sounds also communicate a miss; impact sounds only follow confirmed contact.
        if (event.action === 'punch' || event.action === 'uppercut' || event.action === 'air-forward' || event.action === 'air-down') cue(pick(['Golpe', 'Golpe2']), .35, event.action === 'uppercut' || event.action === 'air-down' ? .88 : undefined);
        else if (event.action === 'dodge' || event.action === 'air-dash') cue('Barrida', .2, 1.45);
        else if (event.action === 'recover') cue('maximize_001', .3, 1.15);
        else if (event.action === 'sweep') cue('Barrida', .45);
        else if (event.action === 'special') {
          const voice = DISCIPLINE_AUDIO[event.discipline ?? 'hardware'];
          if (voice.windup) cue(voice.windup, .5, voice.rate);
        } else if (event.action === 'combo') {
          if (event.discipline === 'networks') cue('Hard', .5);
          if (event.discipline === 'design') cue('Seleccion', .5);
        }
      }
    }
    if (snapshot) this.motion(snapshot);
  }
  destroy() {
    this.destroyed = true; this.generation++;
    document.removeEventListener('visibilitychange', this.visibility);
    this.music.pause(); this.music.removeEventListener('ended', this.nextTrack);
    this.music.removeAttribute('src'); this.music.load();
    if (this.duckTimer) clearTimeout(this.duckTimer);
    this.stopVoices(); void this.context?.close();
    this.buffers.clear(); this.loading.clear(); this.encoded.clear();
  }
  private ensureContext() {
    if (this.context) return;
    this.context = new AudioContext();
    this.gain = this.context.createGain();
    this.gain.gain.value = clamp(this.settings?.effectsVolume ?? .8);
    this.compressor = this.context.createDynamicsCompressor();
    this.compressor.threshold.value = -10; this.compressor.knee.value = 12;
    this.compressor.ratio.value = 5; this.compressor.attack.value = .003; this.compressor.release.value = .12;
    // Compressor comes before user volume so muting stays immediate and exact.
    this.compressor.connect(this.gain); this.gain.connect(this.context.destination);
  }
  private motion(snapshot: MatchSnapshot) {
    const previous = this.previousSnapshot;
    this.previousSnapshot = snapshot;
    if (!previous || previous.matchId !== snapshot.matchId || previous.phase !== 'playing' || snapshot.phase !== 'playing'
      || snapshot.tick <= previous.tick || snapshot.tick - previous.tick > 8 || this.scene !== 'match') return;
    for (const fighter of snapshot.fighters) {
      const before = previous.fighters.find(f => f.id === fighter.id);
      if (!before || fighter.eliminated || before.lives !== fighter.lives || Math.abs(fighter.x - before.x) > 150 || Math.abs(fighter.y - before.y) > 150 || fighter.invulnerable > 0) continue;
      const pan = Math.max(-.55, Math.min(.55, (fighter.x / 1366 * 2 - 1) * .55));
      if (before.grounded && !fighter.grounded && fighter.vy < -500 && fighter.action === 'jump' && this.allow(`jump:${fighter.id}`, 200)) void this.play('Barrida', .13, pan, false, 1.3);
      if (!before.grounded && fighter.grounded && before.vy > 180 && this.allow(`land:${fighter.id}`, 160)) void this.play('impactSoft_medium_000', .18 + Math.min(.15, before.vy / 4000), pan);
    }
  }
  private nextTrack = () => {
    if (this.destroyed || this.scene !== 'match') return;
    if (!this.playlist.length) {
      this.playlist = [...this.manifest.audio[this.settings?.playlist ?? 'remake']];
      for (let i = this.playlist.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.playlist[i], this.playlist[j]] = [this.playlist[j], this.playlist[i]]; }
      if (this.playlist.length > 1 && this.playlist[0] === this.previousTrack) [this.playlist[0], this.playlist[1]] = [this.playlist[1], this.playlist[0]];
    }
    const track = this.playlist.shift();
    if (track) { this.previousTrack = track; this.music.src = track; this.playMusic(); }
  };
  private visibility = () => {
    this.generation++; this.previousSnapshot = undefined;
    if (document.hidden) { this.music.pause(); this.stopVoices(); void this.context?.suspend(); }
    else if (this.scene !== 'silent') { if (this.unlocked) void this.context?.resume().catch(() => {}); this.playMusic(); }
  };
  private playMusic() { if (this.unlocked && this.scene !== 'silent' && !document.hidden && !this.destroyed && this.settings?.musicVolume) void this.music.play().catch(() => { /* Next trusted gesture retries. */ }); }
  private updateMusicVolume() { this.music.volume = clamp(this.settings?.musicVolume ?? 0) * (performance.now() < this.duckUntil ? .65 : 1); }
  private duck(milliseconds: number) {
    this.duckUntil = performance.now() + milliseconds; this.updateMusicVolume();
    if (this.duckTimer) clearTimeout(this.duckTimer);
    this.duckTimer = setTimeout(() => this.updateMusicVolume(), milliseconds + 10);
  }
  private allow(key: string, milliseconds: number) {
    const now = performance.now(); const last = this.recent.get(key);
    if (last !== undefined && now - last < milliseconds) return false;
    this.recent.set(key, now);
    if (this.recent.size > 256) this.recent.delete(this.recent.keys().next().value!);
    return true;
  }
  private fetchEncoded(name: string) {
    const url = this.manifest.audio.effects[name] ?? asset(name);
    if (!this.encoded.has(name)) this.encoded.set(name, fetch(url).then(response => response.ok ? response.arrayBuffer() : undefined).catch(() => undefined));
    return this.encoded.get(name)!;
  }
  private async buffer(name: string) {
    if (this.buffers.has(name)) return this.buffers.get(name);
    if (!this.context || this.destroyed) return;
    if (!this.loading.has(name)) this.loading.set(name, this.fetchEncoded(name).then(async data => {
      if (!data || this.destroyed || !this.context) return;
      const buffer = await this.context.decodeAudioData(data.slice(0));
      // Balance legacy clips in memory; source WAVs are untouched. Peak headroom bounds boosts.
      let sum = 0, peak = 0;
      for (let c = 0; c < buffer.numberOfChannels; c++) for (const value of buffer.getChannelData(c)) { sum += value * value; peak = Math.max(peak, Math.abs(value)); }
      const rms = Math.sqrt(sum / (buffer.length * buffer.numberOfChannels));
      const scale = rms > 0 && peak > 0 ? Math.min(6, .17 / rms, .82 / peak) : 1;
      for (let c = 0; c < buffer.numberOfChannels; c++) { const channel = buffer.getChannelData(c); for (let i = 0; i < channel.length; i++) channel[i] *= scale; }
      if (!this.destroyed) this.buffers.set(name, buffer);
      return buffer;
    }).catch(() => undefined));
    return this.loading.get(name);
  }
  private async play(name: string, volume = .65, pan = 0, ui = false, rate?: number) {
    if (this.destroyed || document.hidden || (!ui && (!this.unlocked || this.scene !== 'match' || this.paused)) || !this.settings?.effectsVolume) return;
    const generation = this.generation, requested = performance.now();
    const buffer = await this.buffer(name);
    if (!buffer || !this.context || !this.compressor || this.destroyed || document.hidden || !this.settings?.effectsVolume || generation !== this.generation
      || performance.now() - requested > 150 || (!ui && (this.scene !== 'match' || this.paused)) || !this.allow(`sample:${name}`, ui ? 65 : 25)) return;
    this.reserveVoice();
    const source = this.context.createBufferSource(), level = this.context.createGain(), stereo = this.context.createStereoPanner();
    source.buffer = buffer; source.playbackRate.value = rate ?? .97 + Math.random() * .06;
    level.gain.value = volume; stereo.pan.value = pan;
    source.connect(level); level.connect(stereo); stereo.connect(this.compressor);
    this.voices.add(source);
    source.onended = () => { this.voices.delete(source); source.disconnect(); level.disconnect(); stereo.disconnect(); };
    source.start();
  }
  private uiFallback(cue: UiSound) {
    if (!this.context || !this.compressor) return;
    this.reserveVoice();
    const source = this.context.createOscillator(), level = this.context.createGain(), now = this.context.currentTime;
    const descending = ['back', 'close', 'unready', 'pause', 'error'].includes(cue);
    source.type = 'sine'; source.frequency.setValueAtTime(descending ? 440 : 660, now);
    source.frequency.exponentialRampToValueAtTime(descending ? 280 : 880, now + .06);
    level.gain.setValueAtTime(0, now); level.gain.linearRampToValueAtTime(.045, now + .004); level.gain.exponentialRampToValueAtTime(.0001, now + .075);
    source.connect(level); level.connect(this.compressor); this.voices.add(source);
    source.onended = () => { this.voices.delete(source); source.disconnect(); level.disconnect(); };
    source.start(); source.stop(now + .08);
  }
  private reserveVoice() { if (this.voices.size >= 16) { const oldest = this.voices.values().next().value; try { oldest?.stop(); } catch { /* ended */ } if (oldest) this.voices.delete(oldest); } }
  private stopVoices() { for (const voice of this.voices) { try { voice.stop(); } catch { /* ended */ } } this.voices.clear(); }
}
