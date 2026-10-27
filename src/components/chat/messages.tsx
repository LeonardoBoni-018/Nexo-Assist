'use client';

import { Fragment, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import type { MessageView, TraceStep, TurnTrace, UiBlock } from '@/shared/chat';
import { ArticlesBlock, OptionsBlock, UiBlocks, type BlockHandlers } from './blocks';
import { DecisionPanel, StatusLine } from './decision-panel';

/** Texto simples com parágrafos, quebras de linha e **negrito**. */
export function RichText({ text, caret = false }: { text: string; caret?: boolean }) {
  const paragraphs = text.split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-2">
      {paragraphs.map((p, i) => (
        <p key={i} className={caret && i === paragraphs.length - 1 ? 'caret' : undefined}>
          {p.split('\n').map((line, j) => (
            <Fragment key={j}>
              {j > 0 ? <br /> : null}
              {line.split(/(\*\*[^*]+\*\*)/g).map((part, k) => (part.startsWith('**') && part.endsWith('**') ? <strong key={k}>{part.slice(2, -2)}</strong> : part))}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}

export function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[520px] rounded-[12px_12px_4px_12px] bg-ink px-4 py-2.5 text-[14.5px] whitespace-pre-wrap text-white">{text}</div>
    </div>
  );
}

export function AgentTurn({
  content,
  ui,
  steps,
  trace,
  streaming,
  h,
}: {
  content: string;
  ui: UiBlock[];
  steps: TraceStep[];
  trace: TurnTrace | null;
  streaming: boolean;
  h: BlockHandlers;
}) {
  const [open, setOpen] = useState(false);
  const options = ui.find((b): b is Extract<UiBlock, { type: 'options' }> => b.type === 'options');
  const articles = ui.find((b): b is Extract<UiBlock, { type: 'articles' }> => b.type === 'articles');
  const thinking = streaming && !content;
  return (
    <div className="flex flex-col gap-2">
      <StatusLine steps={steps} trace={trace} open={open} onToggle={trace ? () => setOpen((o) => !o) : undefined} />
      {open && trace ? <DecisionPanel trace={trace} /> : null}
      {content || thinking || options ? (
        <div className="flex w-fit max-w-[600px] flex-col gap-3 rounded-[4px_12px_12px_12px] border border-rule bg-paper px-4 py-3 text-[14.5px]">
          {thinking ? (
            <span className="flex items-center gap-1 py-1" aria-label="Nexo Assist está pensando">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-1.5 animate-bounce rounded-full bg-ink-3/60" style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </span>
          ) : (
            <RichText text={content} caret={streaming} />
          )}
          {articles ? <ArticlesBlock articles={articles.articles} /> : null}
          {options ? <OptionsBlock question={options.question} options={options.options} disabled={!h.interactive} onPick={h.onSend} /> : null}
        </div>
      ) : null}
      <UiBlocks blocks={ui} h={h} />
    </div>
  );
}

export function SystemLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 py-1 text-[12.5px] text-ink-3">
      <span className="h-px flex-1 bg-rule" />
      <span className="flex items-center gap-1.5">
        <ArrowLeftRight size={13} /> {text}
      </span>
      <span className="h-px flex-1 bg-rule" />
    </div>
  );
}

export function AnalystBubble({ m }: { m: MessageView }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-center gap-2 text-[12.5px]">
        <span className="font-semibold">{m.authorName}</span>
        <span className="rounded-md bg-success-soft px-1.5 py-0.5 text-[11px] font-semibold text-success-text">Analista</span>
      </p>
      <div className="w-fit max-w-[600px] rounded-[4px_12px_12px_12px] bg-human-bubble px-4 py-3 text-[14.5px]">
        <RichText text={m.content} />
      </div>
    </div>
  );
}
