import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from 'react';
import { LogIn, LogOut, X } from 'lucide-react';
import { api } from './api';
type User = { id: string; name: string; email: string; role: 'admin' | 'member' };
const Context = createContext<{ user: User | null; open: () => void; logout: () => void }>({
  user: null,
  open: () => {},
  logout: () => {},
});
export const useAuth = () => useContext(Context);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [show, setShow] = useState(false);
  useEffect(() => {
    api<{ user: User | null }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
    const listener = () => setShow(true);
    window.addEventListener('auth-required', listener);
    return () => window.removeEventListener('auth-required', listener);
  }, []);
  const logout = async () => {
    await api('/auth/logout', 'POST', {});
    setUser(null);
  };
  return (
    <Context.Provider value={{ user, open: () => setShow(true), logout: () => void logout() }}>
      {ready && <div key={user?.id || 'guest'}>{children}</div>}
      {show && (
        <Login
          onClose={() => setShow(false)}
          onUser={(u) => {
            setUser(u);
            setShow(false);
          }}
        />
      )}
    </Context.Provider>
  );
}
export function AccountButton() {
  const { user, open, logout } = useAuth();
  return (
    <button
      className="account-button"
      onClick={user ? logout : open}
      title={user ? 'Выйти из аккаунта' : 'Войти, чтобы сохранять личные отметки'}
    >
      {user ? (
        <>
          <span>{user.name}</span>
          <LogOut size={16} />
        </>
      ) : (
        <>
          <LogIn size={16} />
          Войти
        </>
      )}
    </button>
  );
}
function Login({ onClose, onUser }: { onClose: () => void; onUser: (user: User) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [register, setRegister] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = Object.fromEntries(new FormData(e.currentTarget));
      onUser(await api<User>('/auth/' + (register ? 'register' : 'login'), 'POST', data));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={ref}
      className="account-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <button className="account-close" type="button" aria-label="Закрыть вход" onClick={onClose}>
        <X size={20} />
      </button>
      <h2>{register ? 'Ваше пространство' : 'С возвращением'}</h2>
      <p>Сохраняйте понравившиеся квартиры, заметки и подборки. Их видите только вы.</p>
      <form onSubmit={submit}>
        {register && (
          <label>
            Как вас зовут
            <input name="name" required maxLength={60} autoComplete="name" />
          </label>
        )}
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Пароль
          <input
            name="password"
            type="password"
            required
            minLength={10}
            maxLength={200}
            autoComplete={register ? 'new-password' : 'current-password'}
          />
        </label>
        {register && (
          <label>
            Код приглашения
            <input name="invite" required autoComplete="off" />
            <small>Получите его у владельца сайта</small>
          </label>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          {busy ? 'Подождите…' : register ? 'Создать аккаунт' : 'Войти'}
        </button>
      </form>
      <button
        className="account-switch"
        onClick={() => {
          setRegister(!register);
          setError('');
        }}
      >
        {register ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
      </button>
    </dialog>
  );
}
