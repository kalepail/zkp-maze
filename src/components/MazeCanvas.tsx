import { useMazeCanvas } from '../hooks/useMazeCanvas';

interface MazeCanvasProps {
  maze: number[][];
  playerPos: [number, number];
  startPos: [number, number];
  endPos: [number, number];
  currentDir: number;
  playerPath: [number, number][];
}

export default function MazeCanvas(props: MazeCanvasProps) {
  const canvasRef = useMazeCanvas(props);

  return (
    <div className="border-2 border-black bg-white flex flex-col h-full">
      <div className="bg-black text-white px-3 py-1 font-mono text-sm border-b-2 border-black">
        Maze
      </div>
      <div className="p-3 flex-1 flex justify-center items-center bg-gray-100 min-h-0">
        <canvas
          ref={canvasRef}
          className="border border-black max-w-full max-h-full"
          style={{
            width: 'auto',
            height: 'auto',
          }}
          aria-label="Maze game canvas"
        />
      </div>
    </div>
  );
}
