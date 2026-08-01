import {
  Hand,
  Brain,
  Cpu,
  Coffee,
  Users,
  Wrench,
  Battery,
  Circle,
  MessageCircle,
  HelpCircle,
  Volume2,
  Clock,
} from 'lucide-react';

/**
 * Maps the `icon` string in categories.json to a component.
 * Unknown names fall back to a neutral circle - a typo in the data file must
 * never crash a card.
 */
const ICONS = {
  hand: Hand,
  brain: Brain,
  cpu: Cpu,
  coffee: Coffee,
  users: Users,
  wrench: Wrench,
  battery: Battery,
  message: MessageCircle,
  help: HelpCircle,
  volume: Volume2,
  clock: Clock,
};

export function iconFor(name) {
  return ICONS[name] || Circle;
}
