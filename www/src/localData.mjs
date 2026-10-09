export function clearStoredGameData(storage) {
    for (const key of ['blink_lb_CLASSIC', 'blink_lb_PRECISION', 'blink_lb_ENDURANCE', 'blink_lb_DAILY', 'blink_theme_purple']) {
        storage.removeItem(key);
    }
}
