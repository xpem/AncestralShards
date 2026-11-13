import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { enableDevIds } from './app/shared/dev-ids';

bootstrapApplication(App, appConfig)
  .then(() => enableDevIds())
  .catch((err) => console.error(err));
