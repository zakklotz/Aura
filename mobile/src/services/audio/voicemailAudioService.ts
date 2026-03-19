class VoicemailAudioService {
  private activeVoicemailId: string | null = null;

  async play(voicemailId: string) {
    if (this.activeVoicemailId && this.activeVoicemailId !== voicemailId) {
      await this.stop();
    }
    this.activeVoicemailId = voicemailId;
  }

  async stop() {
    this.activeVoicemailId = null;
  }

  get currentVoicemailId() {
    return this.activeVoicemailId;
  }
}

export const voicemailAudioService = new VoicemailAudioService();
