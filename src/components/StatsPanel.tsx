import { DIRECTION_NAMES } from '../constants/maze';

interface StatsPanelProps {
  mazeSeed: number;
  currentDir: number;
  moveCount: number;
  elapsedTime: number;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function StatsPanel({
  mazeSeed,
  currentDir,
  moveCount,
  elapsedTime,
}: StatsPanelProps) {
  return (
    <div className="border-2 border-black p-4 mb-4 bg-[#efefef]">
      <div className="font-mono text-xs space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-bold">🌱 Maze Seed:</span>
          <code className="bg-white px-2 py-1 border border-black">{mazeSeed}</code>
        </div>
        <div>🎯 Navigate from yellow to green square</div>
        <div>⌨️ Use arrow keys or WASD to move</div>
        <div>📍 Current direction: <span className="font-bold">{DIRECTION_NAMES[currentDir]}</span></div>
        <div className="flex gap-4">
          <span>📊 Moves: <span className="font-bold">{moveCount}</span></span>
          <span>⏱️ Time: <span className="font-bold">{formatTime(elapsedTime)}</span></span>
        </div>
      </div>
    </div>
  );
}
