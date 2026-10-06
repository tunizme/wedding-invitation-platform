import { test, expect } from './fixtures';

interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}
const corner = (value: Geometry) => {
  const radians = (value.rotation * Math.PI) / 180;
  return {
    x:
      value.x +
      value.width / 2 -
      (value.width / 2) * Math.cos(radians) +
      (value.height / 2) * Math.sin(radians),
    y:
      value.y +
      value.height / 2 -
      (value.width / 2) * Math.sin(radians) -
      (value.height / 2) * Math.cos(radians),
  };
};
for (const zoom of [0.5, 1, 2]) {
  test(`Craft/Moveable production remount + rotated resize at zoom ${zoom}`, async ({
    page,
    builderOrigin,
  }) => {
    const failures: string[] = [];
    page.on('pageerror', (error) => {
      failures.push(error.message);
      console.error('Compatibility page error:', error.message);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') failures.push(message.text());
    });
    await page.goto(builderOrigin);
    await expect(page.getByTestId('target')).toBeVisible();
    await page.getByRole('button', { name: 'Remount editor' }).click();
    await page.getByLabel('Zoom').selectOption(String(zoom));
    await page.getByTestId('target').click();
    await expect(page.locator('.moveable-control-box')).toHaveCount(1);
    const read = async () =>
      JSON.parse(await page.getByTestId('geometry').innerText()) as Geometry;
    const before = await read();
    const anchorBefore = corner(before);
    const handle = page.locator('.moveable-se');
    await expect(handle).toBeVisible();
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    const radians = (before.rotation * Math.PI) / 180;
    const delta = {
      x: (40 * Math.cos(radians) - 20 * Math.sin(radians)) * zoom,
      y: (40 * Math.sin(radians) + 20 * Math.cos(radians)) * zoom,
    };
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box!.x + box!.width / 2 + delta.x,
      box!.y + box!.height / 2 + delta.y,
      { steps: 10 },
    );
    await page.mouse.up();
    await expect(page.getByTestId('commits')).toHaveText('1');
    const after = await read();
    expect(Math.abs(after.width - before.width - 40)).toBeLessThan(1);
    expect(Math.abs(after.height - before.height - 20)).toBeLessThan(1);
    const anchorAfter = corner(after);
    expect(Math.abs(anchorAfter.x - anchorBefore.x)).toBeLessThan(1);
    expect(Math.abs(anchorAfter.y - anchorBefore.y)).toBeLessThan(1);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(read).toEqual(before);
    await expect(
      page.getByRole('button', { name: 'Undo', exact: true }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect.poll(read).toEqual(after);
    await page.getByRole('button', { name: 'Serialize', exact: true }).click();
    const serialized = await page
      .getByLabel('Serialized document')
      .inputValue();
    const nodes = JSON.parse(serialized) as Record<
      string,
      { parent?: string; nodes: string[]; props: Geometry }
    >;
    expect(nodes.ROOT.nodes).toEqual(['a550e840-e29b-41d4-a716-446655440001']);
    expect(nodes[nodes.ROOT.nodes[0]].props).toEqual(after);
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await expect.poll(read).toEqual(after);
    await page.getByRole('button', { name: 'Serialize', exact: true }).click();
    expect(
      JSON.parse(await page.getByLabel('Serialized document').inputValue()),
    ).toEqual(nodes);
    expect(failures).toEqual([]);
  });
}
