import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CookieService } from 'ngx-cookie-service';
import { catchError, finalize, map, Observable, of, shareReplay, tap } from 'rxjs';
import { AuthTokens } from '../models/shards.model';
import { UserApiService } from './user-api';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private cookies = inject(CookieService);
  private userApi = inject(UserApiService);
  private router = inject(Router);

  private readonly TOKEN_KEY = 'shards_token';
  private readonly REFRESH_KEY = 'shards_refresh';

  private authenticated = signal(!!this.cookies.get(this.TOKEN_KEY));
  readonly isAuthenticated = computed(() => this.authenticated());

  // O refresh token é trocado a cada uso: requisições 401 simultâneas dividem a mesma renovação.
  private refreshing$: Observable<boolean> | null = null;

  getToken(): string | null {
    return this.cookies.get(this.TOKEN_KEY) || null;
  }

  saveTokens(tokens: AuthTokens, rememberMe = false): void {
    const options = {
      ...(rememberMe ? { expires: 30 } : {}),
      secure: location.protocol === 'https:',
      sameSite: 'Lax' as const,
      path: '/',
    };
    this.cookies.set(this.TOKEN_KEY, tokens.token, options);
    this.cookies.set(this.REFRESH_KEY, tokens.refreshToken, options);
    this.authenticated.set(true);
  }

  refreshSession(): Observable<boolean> {
    const refreshToken = this.cookies.get(this.REFRESH_KEY);
    if (!refreshToken) return of(false);

    this.refreshing$ ??= this.userApi.refresh(refreshToken).pipe(
      tap((tokens) => this.saveTokens(tokens, this.isPersistent())),
      map(() => true),
      catchError(() => of(false)),
      finalize(() => (this.refreshing$ = null)),
      shareReplay(1),
    );
    return this.refreshing$;
  }

  logout(): void {
    this.cookies.delete(this.TOKEN_KEY, '/');
    this.cookies.delete(this.REFRESH_KEY, '/');
    this.authenticated.set(false);
  }

  /** Sessão perdida (refresh falhou): limpa e volta ao login. */
  expireSession(): void {
    this.logout();
    this.router.navigate(['/user/signin']);
  }

  // O cookie "lembrar-me" tem validade; o de sessão não. Não dá para ler a validade, então guardamos a escolha.
  private isPersistent(): boolean {
    return localStorage.getItem('shards_remember') === '1';
  }

  setRemember(remember: boolean): void {
    if (remember) localStorage.setItem('shards_remember', '1');
    else localStorage.removeItem('shards_remember');
  }
}
