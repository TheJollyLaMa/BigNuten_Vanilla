// AdminCompetitionPanel.jsx - Admin UI for Competition & StreakBet Setup
// 版权声明：MIT License | Copyright (c) 2026 思捷娅科技 (SJYKJ)

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Settings, Users, Trophy, DollarSign, Clock } from 'lucide-react';

export function AdminCompetitionPanel({ engineContract }) {
  const [activeTab, setActiveTab] = useState('create');
  const [competitions, setCompetitions] = useState([]);
  
  // Create competition form state
  const [formData, setFormData] = useState({
    token: 'ETH',
    entryAmount: '',
    duration: '4',
    durationUnit: 'weeks',
    checkInInterval: '1',
    checkInUnit: 'weeks',
  });

  const handleCreate = async () => {
    // Convert to seconds
    const durationSeconds = convertToSeconds(formData.duration, formData.durationUnit);
    const checkInSeconds = convertToSeconds(formData.checkInInterval, formData.checkInUnit);
    const entryAmount = parseAmount(formData.entryAmount, formData.token);
    
    // Get token address (0 for ETH)
    const tokenAddress = formData.token === 'ETH' ? '0x0000000000000000000000000000000000000000' : getTokenAddress(formData.token);
    
    // Create competition
    const tx = await engineContract.createCompetition(
      tokenAddress,
      entryAmount,
      durationSeconds,
      checkInSeconds
    );
    
    await tx.wait();
    
    // Refresh competitions list
    loadCompetitions();
  };

  const convertToSeconds = (value, unit) => {
    const multipliers = {
      hours: 3600,
      days: 86400,
      weeks: 604800,
      months: 2592000,
    };
    return parseInt(value) * multipliers[unit];
  };

  const parseAmount = (amount, token) => {
    // Convert to wei based on token
    const decimals = token === 'ETH' ? 18 : 18; // Adjust for BNUT/USDC
    return ethers.utils.parseUnits(amount, decimals);
  };

  const getTokenAddress = (token) => {
    const addresses = {
      ETH: '0x0000000000000000000000000000000000000000',
      BNUT: '0x...', // Replace with actual BNUT address
      USDC: '0x...', // Replace with actual USDC address
    };
    return addresses[token];
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">🏆 Competition Admin Panel</h1>
          <p className="text-muted-foreground">Manage competitions and streak bets</p>
        </div>
        <Button onClick={() => setActiveTab('create')}>
          <Plus className="w-4 h-4 mr-2" />
          Create Competition
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 border-b">
        <Button
          variant={activeTab === 'create' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('create')}
        >
          <Plus className="w-4 h-4 mr-2" />
          Create
        </Button>
        <Button
          variant={activeTab === 'manage' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('manage')}
        >
          <Settings className="w-4 h-4 mr-2" />
          Manage
        </Button>
        <Button
          variant={activeTab === 'stats' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('stats')}
        >
          <Trophy className="w-4 h-4 mr-2" />
          Statistics
        </Button>
      </div>

      {/* Create Tab */}
      {activeTab === 'create' && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Competition</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="token">Token</Label>
                <Select
                  value={formData.token}
                  onValueChange={(value) => setFormData({ ...formData, token: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ETH">ETH</SelectItem>
                    <SelectItem value="BNUT">BNUT</SelectItem>
                    <SelectItem value="USDC">USDC</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="entryAmount">Entry Amount</Label>
                <Input
                  id="entryAmount"
                  type="number"
                  placeholder="0.1"
                  value={formData.entryAmount}
                  onChange={(e) => setFormData({ ...formData, entryAmount: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="duration">Duration</Label>
                <div className="flex space-x-2">
                  <Input
                    id="duration"
                    type="number"
                    placeholder="4"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                  />
                  <Select
                    value={formData.durationUnit}
                    onValueChange={(value) => setFormData({ ...formData, durationUnit: value })}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hours">Hours</SelectItem>
                      <SelectItem value="days">Days</SelectItem>
                      <SelectItem value="weeks">Weeks</SelectItem>
                      <SelectItem value="months">Months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="checkInInterval">Check-in Interval</Label>
                <div className="flex space-x-2">
                  <Input
                    id="checkInInterval"
                    type="number"
                    placeholder="1"
                    value={formData.checkInInterval}
                    onChange={(e) => setFormData({ ...formData, checkInInterval: e.target.value })}
                  />
                  <Select
                    value={formData.checkInUnit}
                    onValueChange={(value) => setFormData({ ...formData, checkInUnit: value })}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hours">Hours</SelectItem>
                      <SelectItem value="days">Days</SelectItem>
                      <SelectItem value="weeks">Weeks</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setFormData({
                token: 'ETH',
                entryAmount: '',
                duration: '4',
                durationUnit: 'weeks',
                checkInInterval: '1',
                checkInUnit: 'weeks',
              })}>
                Reset
              </Button>
              <Button onClick={handleCreate}>
                <Plus className="w-4 h-4 mr-2" />
                Create Competition
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manage Tab */}
      {activeTab === 'manage' && (
        <Card>
          <CardHeader>
            <CardTitle>Manage Competitions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Competition List */}
              {competitions.map((comp) => (
                <div key={comp.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold">Competition #{comp.id}</h3>
                      <p className="text-sm text-muted-foreground">
                        Entry: {comp.entryAmount} {comp.token} | 
                        Duration: {comp.duration} | 
                        Pot: {comp.totalPot} {comp.token}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <Badge variant={comp.active ? 'default' : 'secondary'}>
                        {comp.active ? 'Active' : 'Completed'}
                      </Badge>
                      <Button size="sm" variant="outline">
                        <Users className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline">
                        <Trophy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Tab */}
      {activeTab === 'stats' && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Competitions</CardTitle>
              <Trophy className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{competitions.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Competitions</CardTitle>
              <Clock className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {competitions.filter(c => c.active).length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Pot</CardTitle>
              <DollarSign className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {competitions.reduce((sum, c) => sum + c.totalPot, 0)} ETH
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Participants</CardTitle>
              <Users className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {competitions.reduce((sum, c) => sum + c.participants, 0)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
