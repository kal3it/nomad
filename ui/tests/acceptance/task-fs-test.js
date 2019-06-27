import { currentURL } from '@ember/test-helpers';
import { Promise } from 'rsvp';
import { module, test } from 'qunit';
import { setupApplicationTest } from 'ember-qunit';
import setupMirage from 'ember-cli-mirage/test-support/setup-mirage';
import FS from 'nomad-ui/tests/pages/allocations/task/fs';

let allocation;
let task;

module('Acceptance | task fs', function(hooks) {
  setupApplicationTest(hooks);
  setupMirage(hooks);

  hooks.beforeEach(async function() {
    server.create('agent');
    server.create('node', 'forceIPv4');
    const job = server.create('job', { createAllocations: false });

    allocation = server.create('allocation', { jobId: job.id, clientStatus: 'running' });
    task = server.schema.taskStates.where({ allocationId: allocation.id }).models[0];
  });

  test('visiting /allocations/:allocation_id/:task_name/fs', async function(assert) {
    await FS.visit({ id: allocation.id, name: task.name });
    assert.equal(currentURL(), `/allocations/${allocation.id}/${task.name}/fs`, 'No redirect');
  });

  test('when the task is not running, an empty state is shown', async function(assert) {
    task.update({
      finishedAt: new Date(),
    });

    await FS.visit({ id: allocation.id, name: task.name });
    assert.ok(FS.hasEmptyState, 'Non-running task has no files');
    assert.ok(
      FS.emptyState.headline.includes('Task is not Running'),
      'Empty state explains the condition'
    );
  });

  test('visiting /allocations/:allocation_id/:task_name/fs/:path', async function(assert) {
    const paths = ['some-file.log', 'a/deep/path/to/a/file.log', '/', 'Unicode™®'];

    const testPath = async filePath => {
      await FS.visitPath({ id: allocation.id, name: task.name, path: filePath });
      assert.equal(
        currentURL(),
        `/allocations/${allocation.id}/${task.name}/fs/${encodeURIComponent(filePath)}`,
        'No redirect'
      );
      assert.equal(FS.breadcrumbsText, `${task.name} ${filePath.replace(/\//g, ' ')}`.trim());
    };

    await paths.reduce(async (prev, filePath) => {
      await prev;
      return testPath(filePath);
    }, Promise.resolve());
  });

  test('navigating allocation filesystem', async function(assert) {
    await FS.visitPath({ id: allocation.id, name: task.name, path: '/' });

    assert.ok(FS.fileViewer.isHidden);

    assert.equal(FS.directoryEntries.length, 4);

    assert.equal(FS.breadcrumbsText, task.name);

    assert.equal(FS.breadcrumbs.length, 1);
    assert.ok(FS.breadcrumbs[0].isActive);
    assert.equal(FS.breadcrumbs[0].text, task.name);

    assert.equal(FS.directoryEntries[0].name, 'directory', 'directories should come first');
    assert.ok(FS.directoryEntries[0].isDirectory);
    assert.equal(FS.directoryEntries[0].size, '', 'directory sizes are hidden');
    assert.equal(FS.directoryEntries[0].lastModified, 'a year ago');

    assert.equal(FS.directoryEntries[2].name, '🤩.txt');
    assert.ok(FS.directoryEntries[2].isFile);
    assert.equal(FS.directoryEntries[2].size, '1 KiB');
    assert.equal(FS.directoryEntries[2].lastModified, '2 days ago');

    assert.equal(FS.directoryEntries[3].name, '🙌🏿.txt');

    await FS.directoryEntries[0].visit();

    assert.equal(FS.directoryEntries.length, 1);

    assert.equal(FS.breadcrumbs.length, 2);
    assert.equal(FS.breadcrumbsText, `${task.name} directory`);

    assert.notOk(FS.breadcrumbs[0].isActive);

    assert.equal(FS.breadcrumbs[1].text, 'directory');
    assert.ok(FS.breadcrumbs[1].isActive);

    await FS.directoryEntries[0].visit();

    assert.equal(FS.directoryEntries.length, 1);
    assert.notOk(FS.directoryEntries[0].path.includes('//'));

    assert.equal(FS.breadcrumbs.length, 3);
    assert.equal(FS.breadcrumbsText, `${task.name} directory another`);
    assert.equal(FS.breadcrumbs[2].text, 'another');

    await FS.breadcrumbs[1].visit();
    assert.equal(FS.breadcrumbsText, `${task.name} directory`);
    assert.equal(FS.breadcrumbs.length, 2);
  });

  test('viewing a file', async function(assert) {
    await FS.visitPath({ id: allocation.id, name: task.name, path: '/' });
    await FS.directoryEntries[2].visit();

    assert.equal(FS.breadcrumbsText, `${task.name} 🤩.txt`);

    assert.ok(FS.fileViewer.isPresent);
  });

  test('viewing an empty directory', async function(assert) {
    await FS.visitPath({ id: allocation.id, name: task.name, path: '/empty-directory' });

    assert.equal(FS.directoryEntries.length, 1);
    assert.ok(FS.directoryEntries[0].isEmpty);
  });
});
