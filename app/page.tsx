'use client';

import WorkspaceEditor from '@/components/WorkspaceEditor';
import StagingArea from '@/components/StagingArea';
import CommitForm from '@/components/CommitForm';
import BranchPanel from '@/components/BranchPanel';
import CommitGraph from '@/components/CommitGraph';
import DiffViewer from '@/components/DiffViewer';
import MergeDialog from '@/components/MergeDialog';

export default function Home() {
  return (
    <main className="flex flex-col min-h-screen p-4 gap-4">
      <header className="border-b border-gray-200 pb-2">
        <h1 className="text-2xl font-bold">GitLite</h1>
        <p className="text-sm text-gray-500">
          A local, in-browser Git implementation for learning.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <section className="md:col-span-2 flex flex-col gap-4">
          <WorkspaceEditor />
          <DiffViewer />
          <CommitGraph />
        </section>
        <aside className="flex flex-col gap-4">
          <StagingArea />
          <CommitForm />
          <BranchPanel />
        </aside>
      </div>

      <MergeDialog />
    </main>
  );
}
