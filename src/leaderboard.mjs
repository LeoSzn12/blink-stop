export function appendScore(list, entry, index, mode, document) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    const score = document.createElement('span');
    name.textContent = `#${index + 1} ${entry.name}`;
    score.textContent = mode === 'CLASSIC'
        ? `${entry.score.toFixed(2)}s`
        : `${entry.score.toFixed(3)}s off`;
    li.append(name, score);
    list.appendChild(li);
}
