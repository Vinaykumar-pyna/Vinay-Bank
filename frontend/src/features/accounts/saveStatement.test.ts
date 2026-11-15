import { saveStatement } from './saveStatement';

/** A promise the test resolves or rejects by hand, to look between the click and the response. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeTab() {
  return { opener: window as unknown, location: { href: '' }, close: jest.fn() };
}

describe('saveStatement', () => {
  const file = new Blob(['<html></html>'], { type: 'text/html' });
  let open: jest.SpyInstance;
  let clicked: HTMLAnchorElement[];

  beforeEach(() => {
    clicked = [];
    open = jest.spyOn(window, 'open');
    URL.createObjectURL = jest.fn(() => 'blob:http://localhost/statement');
    URL.revokeObjectURL = jest.fn();
    jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(this);
      });
  });

  afterEach(() => jest.restoreAllMocks());

  it('opens the print tab during the click, cut off from this window', async () => {
    const tab = fakeTab();
    open.mockReturnValue(tab);
    const response = deferred<Blob>();

    const saving = saveStatement('html', () => response.promise, 'statement');
    // Still inside the click: the tab exists before the server has answered
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(tab.opener).toBeNull();
    expect(tab.location.href).toBe('');

    response.resolve(file);
    await saving;
    expect(tab.location.href).toBe('blob:http://localhost/statement');
    expect(clicked).toHaveLength(0);
  });

  it('downloads the page instead when a popup blocker refuses the tab', async () => {
    open.mockReturnValue(null);
    await saveStatement('html', () => Promise.resolve(file), 'ArthaBank-0014-statement');
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe('ArthaBank-0014-statement.html');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/statement');
  });

  it('downloads CSV and XML files without opening a tab', async () => {
    await saveStatement('csv', () => Promise.resolve(file), 'ArthaBank-0014-statement');
    expect(open).not.toHaveBeenCalled();
    expect(clicked[0].download).toBe('ArthaBank-0014-statement.csv');
  });

  it('closes the empty tab and reports the error when the request fails', async () => {
    const tab = fakeTab();
    open.mockReturnValue(tab);
    await expect(
      saveStatement('html', () => Promise.reject(new Error('Network down')), 'statement'),
    ).rejects.toThrow('Network down');
    expect(tab.close).toHaveBeenCalled();
  });
});
