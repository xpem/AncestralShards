import { HttpErrorResponse, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './services/auth.service';

const withToken = (req: HttpRequest<unknown>, token: string) =>
  req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });

export const tokenInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const auth = inject(AuthService);
  const token = auth.getToken();
  const authReq = token ? withToken(req, token) : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // Login/cadastro/refresh devolvem 400; 401 sem token aqui não tem o que renovar.
      const isAuthCall = req.url.includes('/User/Session') || !token;
      if (error.status !== 401 || isAuthCall) return throwError(() => error);

      return auth.refreshSession().pipe(
        switchMap((ok) => {
          const fresh = ok ? auth.getToken() : null;
          if (!fresh) {
            auth.expireSession();
            return throwError(() => error);
          }
          return next(withToken(req, fresh));
        }),
      );
    }),
  );
};
