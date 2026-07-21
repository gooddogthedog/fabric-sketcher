export class ProjectWriteQueue {
  readonly #tails = new Map<string, Promise<void>>();

  run<T>(projectId: string, write: () => Promise<T>): Promise<T> {
    const previous = this.#tails.get(projectId) ?? Promise.resolve();
    const result = previous.then(write, write);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.#tails.set(projectId, tail);
    void tail.then(() => {
      if (this.#tails.get(projectId) === tail) {
        this.#tails.delete(projectId);
      }
    });
    return result;
  }
}
