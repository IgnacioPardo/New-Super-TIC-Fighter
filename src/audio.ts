import type { AppSettings, AssetsManifest, GameplayEvent } from './shared/types';

/** Music streams on demand; short, confirmed combat cues use Web Audio. */
export class AudioManager {
  private context?: AudioContext;
  private gain?: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | undefined>>();
  private voices = new Set<AudioBufferSourceNode>();
  private seen = new Set<string>();
  private music = new Audio();
  private scene: 'menu' | 'match' | 'silent' = 'silent';
  private settings?: AppSettings;
  private playlist: string[] = [];
  private previousTrack = '';
  private destroyed = false;
  unlocked = false;

  constructor(private manifest: AssetsManifest) {
    this.music.preload = 'none';
    this.music.addEventListener('ended', this.nextTrack);
  }
  setSettings(settings: AppSettings) {
    const playlistChanged = this.settings?.playlist !== settings.playlist;
    this.settings = settings;
    this.music.volume = Math.min(1, Math.max(0, settings.musicVolume));
    if (this.gain) this.gain.gain.value = Math.min(1, Math.max(0, settings.effectsVolume));
    if (playlistChanged) { this.playlist = []; if (this.scene === 'match') this.nextTrack(); }
  }
  async unlock(): Promise<void> {
    if (this.destroyed) return;
    this.context ??= new AudioContext();
    if (!this.gain) { this.gain = this.context.createGain(); this.gain.gain.value = this.settings?.effectsVolume ?? .8; this.gain.connect(this.context.destination); }
    try { await this.context.resume(); this.unlocked = this.context.state === 'running'; } catch { this.unlocked = false; }
    if (this.unlocked) for (const name of Object.keys(this.manifest.audio.effects)) void this.buffer(name);
    if (this.unlocked && this.scene !== 'silent') {
      if (!this.music.src) this.nextTrack();
      try { await this.music.play(); } catch { /* Browser may require a pointer/keyboard gesture for music independently. */ }
    }
  }
  setScene(scene: 'menu' | 'match' | 'silent') {
    if (this.scene === scene) return;
    this.scene = scene;
    for (const voice of this.voices) { try { voice.stop(); } catch { /* already ended */ } }
    this.music.pause();
    if (scene === 'silent') return;
    if (scene === 'menu') { this.music.src = this.manifest.audio.intro; this.music.loop = true; this.playMusic(); }
    else { this.music.loop = false; this.nextTrack(); }
  }
  handleEvents(events: GameplayEvent[]) {
    for (const event of events) {
      if (this.seen.has(event.id)) continue;
      this.seen.add(event.id);
      if (this.seen.size > 1024) this.seen.delete(this.seen.values().next().value!);
      if (event.type === 'fight') this.play('Fight');
      if (event.type === 'block') this.play('Golpeado');
      if (event.type === 'hit') {
        const sound = event.action === 'punch' || event.action === 'uppercut' ? 'Gancho'
          : event.action === 'special' ? ({networks:'Latigo', design:'golpeMouse', code:'Bola', hardware:''}[event.discipline ?? 'hardware'])
          : event.action === 'combo' && event.discipline === 'hardware' ? 'golpeMouse' : '';
        if (sound) this.play(sound);
      }
      if (event.type === 'active') {
        const sound = event.action === 'special' ? {design:'Mouse',hardware:'RAM',networks:'',code:''}[event.discipline ?? 'networks']
          : event.action === 'combo' ? {hardware:'Disco',code:'Programacion',networks:'',design:''}[event.discipline ?? 'networks'] : '';
        if (sound) this.play(sound);
      }
      if (event.type !== 'attack') continue;
      if (event.action === 'punch' || event.action === 'uppercut') this.play(Math.random() < .5 ? 'Golpe' : 'Golpe2');
      else if (event.action === 'sweep') this.play('Barrida');
      else if (event.action === 'special') {
        const initial = {networks:'Redes', design:'', code:'Prog', hardware:'Hard'}[event.discipline ?? 'hardware'];
        if (initial) this.play(initial);
      } else if (event.action === 'combo') {
        if (event.discipline === 'networks') this.play('Hard');
        if (event.discipline === 'design') this.play('Seleccion');
      }
    }
  }
  destroy() {
    this.destroyed = true; this.music.pause(); this.music.removeEventListener('ended', this.nextTrack);
    this.music.removeAttribute('src'); this.music.load(); void this.context?.close(); this.voices.clear();
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
  private playMusic() { if (this.unlocked) void this.music.play().catch(() => { /* Next trusted gesture retries. */ }); }
  private async buffer(name: string) {
    if (this.buffers.has(name)) return this.buffers.get(name);
    if (!this.context || !this.manifest.audio.effects[name]) return;
    if (!this.loading.has(name)) this.loading.set(name, fetch(this.manifest.audio.effects[name]).then(response => {
      if (!response.ok) throw new Error('Sound unavailable'); return response.arrayBuffer();
    }).then(data => this.context!.decodeAudioData(data)).then(buffer => { this.buffers.set(name, buffer); return buffer; }).catch(() => undefined));
    return this.loading.get(name);
  }
  private async play(name: string) {
    if (!this.unlocked || this.destroyed || this.scene !== 'match' || !this.settings?.effectsVolume) return;
    const buffer = await this.buffer(name);
    if (!buffer || !this.context || !this.gain || this.destroyed || this.scene !== 'match') return;
    if (this.voices.size >= 16) { const oldest = this.voices.values().next().value; try { oldest?.stop(); } catch { /* already ended */ } }
    const source = this.context.createBufferSource(); source.buffer = buffer; source.connect(this.gain); this.voices.add(source);
    source.onended = () => { this.voices.delete(source); source.disconnect(); }; source.start();
  }
}
