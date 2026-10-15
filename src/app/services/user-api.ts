import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthTokens } from '../models/shards.model';

export interface SignInPayload {
  email: string;
  password: string;
}

export interface SignUpPayload extends SignInPayload {
  name: string;
}

const SOURCE = 'shards';

@Injectable({ providedIn: 'root' })
export class UserApiService {
  private http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/User`;

  signIn(payload: SignInPayload): Observable<AuthTokens> {
    return this.http.post<AuthTokens>(`${this.apiUrl}/Session`, { ...payload, source: SOURCE });
  }

  signUp(payload: SignUpPayload): Observable<unknown> {
    return this.http.post(this.apiUrl, { ...payload, source: SOURCE });
  }

  refresh(refreshToken: string): Observable<AuthTokens> {
    return this.http.post<AuthTokens>(`${this.apiUrl}/Session/Refresh`, { refreshToken });
  }
}
