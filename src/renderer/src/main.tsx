import { createRoot } from 'react-dom/client'
import Settings from './Settings'
import './styles.css'

// StrictMode специально не включаем: окно создаётся заново на каждое открытие,
// а двойной mount в dev-режиме добавлял бы лишние IPC-запросы.
const root = document.getElementById('root')
if (!root) throw new Error('Не найден #root')

createRoot(root).render(<Settings />)
