import type { ModelDefinition } from "../domain/models/model-catalog.js";
import {
  ProviderSettingsService,
  type CliProvider,
  type ProviderSettings,
} from "../infrastructure/providers/provider-settings.js";

export class ProviderController {
  private settings: ProviderSettings;

  constructor(
    private readonly service = new ProviderSettingsService(),
    environment: NodeJS.ProcessEnv = process.env,
  ) {
    this.settings = service.load(environment);
  }

  get current(): ProviderSettings {
    return this.settings;
  }

  switch(provider: CliProvider): ProviderSettings {
    this.settings = this.service.switch(this.settings, provider);
    return this.settings;
  }

  parse(value: string | undefined): CliProvider {
    return this.service.parse(value);
  }

  setModel(modelId: string): ProviderSettings {
    this.settings = { ...this.settings, modelId };
    return this.settings;
  }

  listModels(): Promise<ModelDefinition[]> {
    return this.service.listModels(this.settings);
  }
}
