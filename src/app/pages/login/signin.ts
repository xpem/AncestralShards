import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { UserApiService } from '../../services/user-api';

@Component({
  selector: 'app-signin',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './signin.html',
  styleUrl: '../auth.css',
})
export class SignIn {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);
  private userApi = inject(UserApiService);

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(30)]],
    rememberMe: [false],
  });
  submitted = signal(false);
  loading = signal(false);
  errorMessage = signal('');
  showPassword = signal(false);

  get f() {
    return this.form.controls;
  }

  onSubmit() {
    this.submitted.set(true);
    this.errorMessage.set('');
    if (this.form.invalid) return;

    const { email, password, rememberMe } = this.form.getRawValue();
    this.loading.set(true);
    this.userApi.signIn({ email, password }).subscribe({
      next: (tokens) => {
        this.auth.setRemember(rememberMe);
        this.auth.saveTokens(tokens, rememberMe);
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        this.router.navigateByUrl(returnUrl && returnUrl.startsWith('/') ? returnUrl : '/');
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.errorMessage.set(
          err.status === 400 ? 'E-mail ou senha inválidos.'
          : err.status === 429 ? 'Muitas tentativas. Aguarde um instante.'
          : 'Não foi possível entrar. Tente novamente.',
        );
      },
    });
  }
}
