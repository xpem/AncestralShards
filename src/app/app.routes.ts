import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './auth-guard';

export const routes: Routes = [
  {
    path: 'user/signin',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/signin').then((m) => m.SignIn),
  },
  {
    path: 'user/signup',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/signup/signup').then((m) => m.SignUp),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/game/game').then((m) => m.Game),
  },
  { path: '**', redirectTo: '' },
];
