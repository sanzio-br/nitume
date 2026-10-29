import { ApplicationConfig } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app/app.routes';
import { lazyAuthInterceptor, provideLazySession } from './app/core/lazy-session/lazy-session';

// WQ-33: only thin shims are eager; the session layer (interceptor,
// SessionStore, AuthApi, realtime token providers) loads on demand. Titles
// are route `title` strings read by Angular's default TitleStrategy. No
// route component reads inputs from the router (views use the route
// snapshot), so withComponentInputBinding is not registered.
export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withFetch(), withInterceptors([lazyAuthInterceptor])),
    provideRouter(routes),
    ...provideLazySession(),
  ],
};
