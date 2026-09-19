import { ApplicationConfig } from '@angular/core';
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { provideBrowserGlobalErrorListeners, provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { authHttpInterceptor } from './core/interceptors/auth-http.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch(), withInterceptors([authHttpInterceptor])),
    provideRouter(routes),
  ],
};
