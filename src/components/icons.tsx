import { Crown, Eye, Flame, Footprints, Gem, Hammer, Handshake, MapPin, MessagesSquare, Sailboat, Skull, Sparkles, Star, Swords } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { EventIcon, StoryEvent } from '../../shared/schema.ts';

/** The symbols an event can carry, with the names shown in the editor. */
export const EVENT_ICONS: Record<EventIcon, { icon: LucideIcon; label: string }> = {
  star: { icon: Star, label: 'Key moment' },
  battle: { icon: Swords, label: 'Battle or fight' },
  council: { icon: MessagesSquare, label: 'Council or conversation' },
  journey: { icon: Footprints, label: 'Journey' },
  arrival: { icon: MapPin, label: 'Arrival' },
  death: { icon: Skull, label: 'Death' },
  magic: { icon: Sparkles, label: 'Magic or wonder' },
  craft: { icon: Hammer, label: 'Forging or building' },
  discovery: { icon: Gem, label: 'Discovery' },
  omen: { icon: Eye, label: 'Omen or secret' },
  disaster: { icon: Flame, label: 'Disaster' },
  crown: { icon: Crown, label: 'Crown or power' },
  ship: { icon: Sailboat, label: 'Ship or sea' },
  bond: { icon: Handshake, label: 'Friendship or love' },
};

export function iconFor(event: Pick<StoryEvent, 'icon' | 'importance'>): LucideIcon {
  return EVENT_ICONS[event.icon ?? (event.importance === 'travel' ? 'journey' : 'star')].icon;
}
