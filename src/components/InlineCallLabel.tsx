import { useEffect, useRef, useState } from 'react';
import type { InlineCallArguments } from '../domain/inline-arguments';

const shorten = (text: string, size: number) => {
  const characters = [...text];
  return characters.length > size ? characters.slice(0, size - 1).join('') + '…' : text;
};

/** Scalar parameters belong to their call; only editing needs an HTML input.
 * The resting label stays SVG text, including in an exported diagram. */
export function InlineCallLabel({
  call,
  width,
  onBegin,
  onCommit,
  onReturnToCanvas,
}: {
  call: InlineCallArguments;
  width: number;
  onBegin: () => void;
  onCommit: (slot: string | null, text: string) => boolean;
  onReturnToCanvas: () => void;
}) {
  const [editing, setEditing] = useState<{ slot: string | null; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const label = useRef<SVGGElement>(null);
  const finished = useRef(false);
  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    }
  }, [editing?.slot]);

  function begin(slot: string | null) {
    const argument = call.arguments.find((item) => item.slot === slot);
    if (slot === null ? !call.insertion : !argument) return;
    finished.current = false;
    onBegin();
    setEditing({ slot, text: argument?.editText ?? '' });
  }
  function finish(save: boolean) {
    if (!editing || finished.current) return;
    finished.current = true;
    if (save) onCommit(editing.slot, editing.text);
    setEditing(null);
  }
  function refocus() {
    requestAnimationFrame(() => {
      const target = label.current?.querySelector<SVGElement>('[role="button"]');
      if (target) target.focus();
      // Saving changes the revision and remounts this label. The outer SVG
      // survives parsing so immediate keyboard undo still reaches the canvas.
      else onReturnToCanvas();
    });
  }
  const available = Math.max(4, Math.floor(width / 8.5) - call.name.length - 2);
  const partLength = Math.max(5, Math.floor(available / Math.max(1, call.parts.length)) - 2);
  return (
    <g
      className="canvas-inline-call"
      ref={label}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {editing ? (
        <foreignObject x={0} y={30} width={width} height={40}>
          <input
            ref={input}
            className="canvas-inline-input"
            aria-label="Valor do argumento"
            title="Número ou texto · Enter salva · Esc cancela"
            value={editing.text}
            onChange={(event) => setEditing({ ...editing, text: event.target.value })}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onBlur={() => finish(true)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Enter' || event.key === 'Escape') {
                event.preventDefault();
                finish(event.key === 'Enter');
                refocus();
              }
            }}
          />
        </foreignObject>
      ) : (
        <text
          className="runtime-operation-label"
          x={width / 2}
          y={56}
          textAnchor="middle"
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => {
            event.stopPropagation();
            if (call.insertion) begin(null);
            else if (call.arguments.length === 1) begin(call.arguments[0].slot);
          }}
        >
          <tspan>{call.name}</tspan>
          {call.insertion ? (
            <tspan
              className="canvas-inline-argument"
              role="button"
              tabIndex={0}
              aria-label={`Adicionar argumento de ${call.name}`}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  begin(null);
                }
              }}
            >
              ()
            </tspan>
          ) : (
            <>
              <tspan>(</tspan>
              {call.parts.map((part, index) => (
                <tspan key={part.slot}>
                  {index > 0 && <tspan>, </tspan>}
                  {part.argument ? (
                    <tspan
                      className="canvas-inline-argument"
                      role="button"
                      tabIndex={0}
                      aria-label={`Editar argumento ${part.slot.startsWith('kw:') ? part.slot.slice(3) : Number(part.slot.slice(3)) + 1} de ${call.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        begin(part.slot);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          begin(part.slot);
                        }
                      }}
                    >
                      {shorten(part.display, partLength)}
                    </tspan>
                  ) : (
                    <tspan>{shorten(part.display, partLength)}</tspan>
                  )}
                </tspan>
              ))}
              <tspan>)</tspan>
            </>
          )}
        </text>
      )}
    </g>
  );
}
