'use client';

import { AlertTriangle, Check, CircleAlert, LoaderCircle, ShieldCheck } from 'lucide-react';
import type { TraceStep, TurnTrace } from '@/shared/chat';

const ACTION_LABEL: Record<string, string> = {
  responder_duvida: 'Responder dúvida',
  consultar_chamado: 'Consultar chamado',
  complementar_chamado: 'Complementar chamado',
  abrir_chamado: 'Abrir chamado',
  pedir_informacao: 'Pedir informação',
  transferir_analista: 'Transferir para analista',
  redirecionar_fora_escopo: 'Redirecionar (fora do escopo de TI)',
  acao_confirmada: 'Executar ação confirmada',
  outro: 'Outra',
};

export function confidenceTone(c: number) {
  if (c >= 0.75) return { bar: 'bg-success', text: 'text-success-text', soft: 'bg-success-soft' };
  if (c >= 0.4) return { bar: 'bg-warning', text: 'text-warning-text', soft: 'bg-warning-soft' };
  return { bar: 'bg-danger', text: 'text-danger-text', soft: 'bg-danger-soft' };
}

export function StepIcon({ status, size = 12 }: { status: TraceStep['status']; size?: number }) {
  if (status === 'running') return <LoaderCircle size={size} className="animate-spin text-primary-text" />;
  if (status === 'error') return <CircleAlert size={size} className="text-danger-text" />;
  return <Check size={size} className="text-ink-3" strokeWidth={2.5} />;
}

/** Linha de status acima da resposta: "Nexo Assist ✓ consultou seus chamados ✓ buscou na central de ajuda". */
export function StatusLine({ steps, onToggle, open, trace, who = 'Nexo Assist' }: { steps: TraceStep[]; onToggle?: () => void; open?: boolean; trace?: TurnTrace | null; who?: string }) {
  const visible = steps.filter((s) => s.visible);
  const confidence = trace?.decision?.confidence;
  const hasIssue = Boolean(trace && (trace.guards.length > 0 || trace.error || steps.some((s) => s.status === 'error')));
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
      <span className="font-semibold">{who}</span>
      {visible.map((s) => (
        <span key={s.id} className={`flex items-center gap-1 ${s.status === 'error' ? 'text-danger-text' : 'text-ink-3'}`}>
          <StepIcon status={s.status} />
          {s.label}
          {s.attempts && s.attempts > 1 ? <span className="text-warning-text">({s.attempts} tentativas)</span> : null}
        </span>
      ))}
      {onToggle && trace ? (
        <button
          onClick={onToggle}
          className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium transition ${open ? 'border-cta/40 bg-primary-soft text-primary-text' : 'border-rule text-ink-3 hover:border-ink-3/40 hover:text-ink'}`}
          aria-expanded={open}
        >
          {hasIssue ? <AlertTriangle size={11} className="text-warning-text" /> : null}
          {open ? 'Ocultar decisão' : 'Por quê?'}
          {confidence != null ? <span className={confidenceTone(confidence).text}>{Math.round(confidence * 100)}%</span> : null}
        </button>
      ) : null}
    </div>
  );
}

function fmtMs(ms: number | null) {
  if (ms == null) return '';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

/** Detalhe da decisão: o que entendeu, que ação tomou, com que confiança e por quê. */
export function DecisionPanel({ trace }: { trace: TurnTrace }) {
  const d = trace.decision;
  const tone = d ? confidenceTone(d.confidence) : null;
  const tokens = trace.usage ? trace.usage.inputTokens + trace.usage.outputTokens : null;
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-rule bg-desk/70 p-4 text-[13px]">
      {d ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2">
            <dt className="text-ink-3">Entendeu</dt>
            <dd>{d.intent}</dd>
            <dt className="text-ink-3">Ação</dt>
            <dd className="font-medium">{ACTION_LABEL[d.action] ?? d.action}</dd>
            <dt className="text-ink-3">Por quê</dt>
            <dd className="text-ink-2">{d.rationale}</dd>
            {d.rules.length ? (
              <>
                <dt className="text-ink-3">Regras</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {d.rules.map((r) => (
                    <span key={r} className="rounded-md bg-paper px-2 py-0.5 text-[12px] text-ink-2 ring-1 ring-rule">
                      {r}
                    </span>
                  ))}
                </dd>
              </>
            ) : null}
          </dl>
          <div className="flex flex-col gap-1.5 self-start rounded-lg bg-paper p-3 ring-1 ring-rule">
            <span className="text-[12px] text-ink-3">Confiança</span>
            <span className={`font-display text-[28px] leading-none ${tone!.text}`}>{Math.round(d.confidence * 100)}%</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-rule">
              <span className={`block h-full ${tone!.bar}`} style={{ width: `${Math.round(d.confidence * 100)}%` }} />
            </span>
          </div>
        </div>
      ) : (
        <p className="text-ink-3">O modelo não declarou a decisão deste turno.</p>
      )}

      {trace.steps.length ? (
        <div>
          <p className="mb-1.5 text-[12px] font-medium text-ink-3">Etapas executadas</p>
          <ol className="flex flex-col divide-y divide-rule overflow-hidden rounded-lg bg-paper ring-1 ring-rule">
            {trace.steps.map((s, i) => (
              <li key={s.id} className="px-3 py-2">
                <details>
                  <summary className="flex cursor-pointer list-none items-center gap-2">
                    <span className="w-4 text-right font-data text-[11px] text-ink-3">{i + 1}</span>
                    <StepIcon status={s.status} />
                    <span className={s.status === 'error' ? 'text-danger-text' : ''}>{s.label}</span>
                    <span className="font-data text-[11px] text-ink-3">{s.tool}</span>
                    <span className="ml-auto flex gap-3 font-data text-[11px] text-ink-3">
                      {s.attempts && s.attempts > 1 ? <span className="text-warning-text">{s.attempts} tentativas</span> : null}
                      {fmtMs(s.durationMs)}
                    </span>
                  </summary>
                  <pre className="mt-2 ml-6 overflow-x-auto rounded-md bg-desk p-2 font-data text-[11px] whitespace-pre-wrap text-ink-2">
                    {JSON.stringify(s.input, null, 2)}
                  </pre>
                </details>
                {s.output ? <p className="mt-0.5 ml-6 text-[12px] text-ink-3">→ {s.output}</p> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {trace.guards.length || trace.error ? (
        <div className="rounded-lg bg-warning-soft px-3 py-2">
          <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-warning-text">
            <ShieldCheck size={13} /> Salvaguardas do servidor
          </p>
          <ul className="list-disc pl-5 text-[12.5px] text-ink-2">
            {trace.guards.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="flex flex-wrap gap-x-3 font-data text-[11px] text-ink-3">
        <span>modelo: {trace.model}</span>
        <span>tempo: {fmtMs(trace.latencyMs)}</span>
        {tokens != null ? (
          <span>
            tokens: {tokens.toLocaleString('pt-BR')}
            {trace.usage!.cachedInputTokens ? ` (${trace.usage!.cachedInputTokens.toLocaleString('pt-BR')} do cache)` : ''}
          </span>
        ) : null}
        {trace.costUsd != null ? <span>custo: US$ {trace.costUsd.toFixed(4).replace('.', ',')}</span> : null}
      </p>
    </div>
  );
}
