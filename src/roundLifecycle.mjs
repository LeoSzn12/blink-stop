// A cleared timeout may already be queued; its generation must also match.
export function createGameOverCameraStop(stopCamera, scheduleTimer = setTimeout, clearTimer = clearTimeout) {
    let timerId = null;
    let generation = 0;
    return {
        schedule() {
            this.cancel();
            const expected = generation;
            timerId = scheduleTimer(() => {
                if (generation !== expected) return;
                timerId = null;
                generation++;
                stopCamera();
            }, 5000);
        },
        cancel() {
            generation++;
            if (timerId !== null) clearTimer(timerId);
            timerId = null;
        }
    };
}
