import { describe, expect, it } from 'vitest';
import { flushLexicalNotes, registerLexicalNoteSaver } from './lexical-note-sync';

describe('freezing notebook changes for AI input', () => {
  it('waits for a panel unmounted immediately before requesting a prompt', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => (finish = resolve));
    const unregister = registerLexicalNoteSaver('pending-project', () => pending);
    unregister();
    let captured = false;
    const capture = flushLexicalNotes('pending-project').then(() => (captured = true));
    await Promise.resolve();
    expect(captured).toBe(false);
    finish();
    await capture;
    expect(captured).toBe(true);
  });

  it('refuses a capture if saving the interpretation failed', async () => {
    const unregister = registerLexicalNoteSaver('failed-project', async () => {
      throw new Error('NOTE_CONFLICT');
    });
    await expect(flushLexicalNotes('failed-project')).rejects.toThrow('NOTE_CONFLICT');
    unregister();
  });

  it('does not wait for notes belonging to another project', async () => {
    let finish!: () => void;
    const unregister = registerLexicalNoteSaver(
      'another-project',
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    await flushLexicalNotes('this-project');
    unregister();
    finish();
    await Promise.resolve();
  });

  it('retains a settled detached failure until that note is remounted and saved', async () => {
    const detached = registerLexicalNoteSaver(
      'detached-project',
      async () => {
        throw new Error('UNSAVED_NOTE');
      },
      'note:1',
    );
    detached();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(flushLexicalNotes('detached-project')).rejects.toThrow('UNSAVED_NOTE');
    let recovered = false;
    const replacement = registerLexicalNoteSaver(
      'detached-project',
      async () => {
        recovered = true;
      },
      'note:1',
    );
    await flushLexicalNotes('detached-project');
    expect(recovered).toBe(true);
    replacement();
  });

  it('drains an editor registered while the previous write is pending', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => (finish = resolve));
    const original = registerLexicalNoteSaver('reopened-project', () => pending, 'note:1');
    const capture = flushLexicalNotes('reopened-project');
    original();
    let savedNew = false;
    const replacement = registerLexicalNoteSaver(
      'reopened-project',
      async () => {
        savedNew = true;
      },
      'note:1',
    );
    finish();
    await capture;
    expect(savedNew).toBe(true);
    replacement();
  });
});
