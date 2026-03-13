'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import styles from './LoginPage.module.css';

// Toggle this to enable email signup/login UI alongside Google
const ENABLE_EMAIL_AUTH = false;

export default function LoginPage() {
  const { loginWithGoogle, loginWithEmail, signup, demoLogin } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (mode === 'login') {
      const err = await loginWithEmail(email, password);
      if (err) setError(err);
    } else {
      if (!displayName.trim()) { setError('닉네임을 입력해주세요'); setLoading(false); return; }
      if (password.length < 6) { setError('비밀번호는 6자 이상이어야 합니다'); setLoading(false); return; }
      const err = await signup(email, password, displayName);
      if (err) setError(err);
      else setSignupSuccess(true);
    }
    setLoading(false);
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>VirtuTrade</div>
        <p className={styles.subtitle}>{t('login.subtitle')}</p>

        {/* Google Login — always shown */}
        <button className={styles.googleBtn} onClick={loginWithGoogle}>
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Google로 시작하기
        </button>

        {/* Email Auth — controlled by ENABLE_EMAIL_AUTH flag */}
        {ENABLE_EMAIL_AUTH && (
          <>
            <div className={styles.divider}><span>또는</span></div>

            {signupSuccess ? (
              <div className={styles.successMsg}>
                <span>✅</span>
                <div>
                  <strong>가입 완료!</strong>
                  <p>이메일 인증 링크를 확인 후 로그인해주세요.</p>
                  <button
                    className={styles.switchBtn}
                    onClick={() => { setSignupSuccess(false); setMode('login'); }}
                  >
                    로그인으로 이동
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.tabs}>
                  <button
                    className={`${styles.tab} ${mode === 'login' ? styles.tabActive : ''}`}
                    onClick={() => { setMode('login'); setError(''); }}
                  >
                    이메일 로그인
                  </button>
                  <button
                    className={`${styles.tab} ${mode === 'signup' ? styles.tabActive : ''}`}
                    onClick={() => { setMode('signup'); setError(''); }}
                  >
                    회원가입
                  </button>
                </div>

                <form onSubmit={handleEmailSubmit} className={styles.form}>
                  {mode === 'signup' && (
                    <div className={styles.inputGroup}>
                      <label>닉네임</label>
                      <input
                        type="text" value={displayName}
                        onChange={e => setDisplayName(e.target.value)}
                        placeholder="트레이더 닉네임"
                        className={styles.input} autoComplete="name"
                      />
                    </div>
                  )}
                  <div className={styles.inputGroup}>
                    <label>이메일</label>
                    <input
                      type="email" value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className={styles.input} required autoComplete="email"
                    />
                  </div>
                  <div className={styles.inputGroup}>
                    <label>비밀번호</label>
                    <input
                      type="password" value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder={mode === 'signup' ? '6자 이상' : '비밀번호 입력'}
                      className={styles.input} required minLength={6}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    />
                  </div>
                  {error && <div className={styles.error}>{error}</div>}
                  <button type="submit" className={styles.submitBtn} disabled={loading}>
                    {loading ? '처리 중...' : mode === 'login' ? '로그인' : '가입하기'}
                  </button>
                </form>
              </>
            )}
          </>
        )}

        <div className={styles.divider}><span>또는</span></div>

        <button className={styles.demoBtn} onClick={demoLogin}>
          🎮 Demo 모드로 체험하기
        </button>

        <div className={styles.features}>
          <div className={styles.feature}>
            <span>💰</span>
            <div><h4>{t('login.feature1Title')}</h4><p>{t('login.feature1Desc')}</p></div>
          </div>
          <div className={styles.feature}>
            <span>📈</span>
            <div><h4>{t('login.feature2Title')}</h4><p>{t('login.feature2Desc')}</p></div>
          </div>
          <div className={styles.feature}>
            <span>🛡️</span>
            <div><h4>{t('login.feature3Title')}</h4><p>{t('login.feature3Desc')}</p></div>
          </div>
        </div>
      </div>
    </div>
  );
}
