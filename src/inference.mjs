// The timeout is diagnostic only: it must never release the in-flight lock.
// FaceMesh.send cannot be cancelled, so allowing another call would overlap inference.
export function createSerializedInference(send, warn = console.warn, timeoutMs = 80,
    schedule = setTimeout, cancel = clearTimeout) {
    let busy = false;
    return {
        send(image) {
            if (busy) return false;
            busy = true;
            let timer;
            try {
                const pending = Promise.resolve(send(image));
                timer = schedule(() => warn(`FaceMesh inference exceeded ${timeoutMs}ms`), timeoutMs);
                return pending.finally(() => {
                    cancel(timer);
                    busy = false;
                });
            } catch (error) {
                busy = false;
                throw error;
            }
        }
    };
}
