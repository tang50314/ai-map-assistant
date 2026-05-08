import type { FormEvent, ReactNode } from 'react';

interface FieldConfig<T> {
  key: keyof T;
  label: string;
  type: string;
}

interface AuthModalProps<T extends Record<string, string>> {
  title: string;
  submitText: string;
  fields: FieldConfig<T>[];
  form: T;
  onChange: (form: T) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
  footer?: ReactNode;
}

export function AuthModal<T extends Record<string, string>>({
  title,
  submitText,
  fields,
  form,
  onChange,
  onSubmit,
  onClose,
  footer,
}: AuthModalProps<T>) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onMouseDown={onClose}>
      <div
        className="bg-[var(--surface-secondary)] p-6 rounded-xl shadow-xl max-w-sm w-full"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[var(--text-primary)]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            关闭
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          {fields.map((field) => (
            <label key={String(field.key)} className="block">
              <span className="block text-sm font-medium text-[var(--text-primary)] mb-1">{field.label}</span>
              <input
                type={field.type}
                value={form[field.key]}
                onChange={(event) => onChange({ ...form, [field.key]: event.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-secondary)]"
                required
              />
            </label>
          ))}
          <button type="submit" className="w-full py-2 px-4 rounded-xl bg-[var(--accent-secondary)] text-white font-medium">
            {submitText}
          </button>
        </form>
        {footer}
      </div>
    </div>
  );
}
