'use client';

import { useState } from 'react';
import { useFileSystem } from '@/hooks/useFileSystem';

// The commit action itself is wired via useRepository in a later task.
// This component only manages the message input and staging-empty checks
// locally against useFileSystem's index/files, and will call the commit
// function passed in (or from useRepository once available).

export interface CommitFormProps {
  onCommit?: (message: string) => void;
}

export default function CommitForm({ onCommit }: CommitFormProps) {
  const { files } = useFileSystem();
  const [message, setMessage] = useState('');

  const stagedCount = Object.values(files).filter(
    (f) => f.status === 'staged'
  ).length;

  const isDisabled = stagedCount === 0 || message.trim().length === 0;

  function handleCommit() {
    if (isDisabled) return;
    onCommit?.(message.trim());
    setMessage('');
  }

  return (
    <div className="border border-gray-200 rounded p-4 bg-white">
      <h2 className="font-semibold mb-2">Commit Form</h2>
      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Commit message"
          className="border border-gray-300 rounded px-2 py-1 text-sm"
          data-testid="commit-message-input"
        />
        <button
          type="button"
          onClick={handleCommit}
          disabled={isDisabled}
          className="text-sm px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          data-testid="commit-button"
        >
          Commit
        </button>
      </div>
    </div>
  );
}
