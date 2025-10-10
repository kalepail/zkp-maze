import { NORTH, EAST, SOUTH, WEST } from '../constants/maze';

interface MobileControlsProps {
  onMove: (direction: number) => void;
  disabled: boolean;
}

export default function MobileControls({ onMove, disabled }: MobileControlsProps) {
  const buttonClass = `
    w-16 h-16 bg-white border-2 border-black font-mono text-2xl
    active:translate-x-[2px] active:translate-y-[2px]
    disabled:opacity-50 disabled:cursor-not-allowed
    hover:bg-gray-100 transition-colors cursor-pointer
    flex items-center justify-center
  `;

  return (
    <div className="md:hidden mt-4 flex">
      <div className="bg-[#efefef] border-2 border-black p-4 w-fit">
        <div className="grid grid-cols-3 gap-2 w-fit">
          {/* Top row - North */}
          <div></div>
          <button
            onClick={() => onMove(NORTH)}
            disabled={disabled}
            className={buttonClass}
            aria-label="Move north (up)"
          >
            ▲
          </button>
          <div></div>

          {/* Middle row - West and East */}
          <button
            onClick={() => onMove(WEST)}
            disabled={disabled}
            className={buttonClass}
            aria-label="Move west (left)"
          >
            ◀
          </button>
          <div className="w-16 h-16 flex items-center justify-center border-2 border-black bg-gray-200">
            <div className="w-3 h-3 rounded-full bg-black"></div>
          </div>
          <button
            onClick={() => onMove(EAST)}
            disabled={disabled}
            className={buttonClass}
            aria-label="Move east (right)"
          >
            ▶
          </button>

          {/* Bottom row - South */}
          <div></div>
          <button
            onClick={() => onMove(SOUTH)}
            disabled={disabled}
            className={buttonClass}
            aria-label="Move south (down)"
          >
            ▼
          </button>
          <div></div>
        </div>
      </div>
    </div>
  );
}
