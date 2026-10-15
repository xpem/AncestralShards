import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { UserApiService } from '../../services/user-api';

const mustMatch = (group: AbstractControl): ValidationErrors | null =>
  group.get('password')?.value === group.get('confirmPassword')?.value ? null : { mustMatch: true };

@Component({
  selector: 'app-signup',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './signup.html',
  styleUrl: '../auth.css',
})
export class SignUp {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private userApi = inject(UserApiService);

  form = this.fb.nonNullable.group(
    {
      name: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(150)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(30)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: mustMatch },
  );
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

    const { name, email, password } = this.form.getRawValue();
    this.loading.set(true);
    this.userApi.signUp({ name, email, password }).subscribe({
      next: () => this.router.navigate(['/user/signin']),
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        // As rotas de usuário respondem 400 com texto simples (contrato, seção 2).
        const text = typeof err.error === 'string' ? err.error : '';
        this.errorMessage.set(
          text.includes('already exists') ? 'Este e-mail já está cadastrado.'
          : err.status === 429 ? 'Muitas tentativas. Aguarde um instante.'
          : 'Não foi possível criar a conta. Verifique os dados e tente novamente.',
        );
      },
    });
  }
}
