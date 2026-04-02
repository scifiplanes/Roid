scanner satellite - costs resource to unlock and then energy per use. Click on a voxel to reveal detailed contents of voxels in a small area. This will require making the underlying first order resource systems more complex, grounded in science. This should influence the refinement feature too.

depth scanner - costs resources to convert a voxel. Unlocks an option for depth overlay inside over the overlays menu, which makes the asteroid transparent, allowing to see densities of voxels of various color. By default it's unfilled. Each depth scanner is slowly unveiling the voxels around it, slower and slower with distances (but in theory a single scanner can reveal the entire asteroid, just very slowly). 

orbital laser - hold and drag to convert voxels into processed matter voxels. Spends energy.
logistics array - hold and drag to convert processed matter voxels into available resources.
refinery - spends energy and resources to convert them into available resources. Will pull resources from voxels connected with any converted voxels, but slower as distance increases. This means replicators will have to start "storing" resources locally in their voxel, as opposed to contribute it to the pool directly.
orbital laser - hold and drag to convert voxels into processed matter voxels. Spends energy. Processed matter voxels need to be refined by refineries.

launcher - allows launching of satellites. Spends energy per launch (included in satellite cost)

em catapult - creates an option to generate a new asteroid. This allows you to get a new asteroid without having to redo all of the research and unlocks.

reactor - generates energy. Costs resources and can be converted out of a processed replicator voxel. Bright orange emissive, pulsing.
battery - stores energy. Costs resources and can be converted out of a processed replicator voxel. Deep blue emissive, pulses very slowly. Each batter contains a set amount of energy. 

excavating laser - hold and drag to destroy voxels. Spends energy.

replicators should have a limited lifespan. This prevents takeover of the entire asteroid with a single replicator drop eventually. Lifespan should be a debug setting.

when laser is selected, camera rotation should still be alowed when clicking outside of the asteroid

computronium - voxel that slowly unlocks more tools. the more computronium - the faster unlocks arrive. There is a debug button to unlock everything. Consumes energy. Clicking on a computronium voxel turns it off. Emissive violet color when active. 


we need to make debug menu scrollable
we need to add laser audio settings into debug menu

satellites should be small voxels

the player needs to be able to excavate laser all voxels types.



we will add a simple music system. There are 5 sine wave voices. Together they should always constitue a major chord, but different for each asteroid. There are debug settings for the following parameters of each of the voices: amp, amp lfo depth, amp lfo speed, amp lfo speed change (a second lfo that modulates the speed of the amp lfo), note (filtering it to the scale of the chord).
The active amount of voices is informed by amount of active voxels - refineries, satellites etc. Can go up to 12

expose all available parameters for dig laser audio effect

we need to gray out tools that use has no resources for.

laser sound should stop or change when out of energy.


we will add a new tool: explosive charges. Converted voxel blinks for a period of time and then explodes destroying voxels in a radius. There is a debug setting for the radius.

we need to add a cost to replicators

asteroid needs to be more randomised. 

we will introduce Discoveries - occasionaly converting a raw voxel yields a discovery. A pop up modal appears where the player accepts an encounter.
Extra resources, resource drain, mysterious lore piece, a variation of an existing tool with subtly different stats. We will create a multi-layered system for generation of discoveries which should yield a combinatorial explosion of millions of combinations


introduce impact craters into generation

propose 12 resource breakdown of top materials

in menu include codex, where all fully consumed asteroids are recorded and can be inspected with all stats

We will add dross and dross collection tool. Activity generated Dross - little cubic particles which hang around a previously active area. These can be gradually collected if the player builds a Dross Collector - a satellite that gradually processed dross into resources. More Collectors can be launched to increase the speed

add parameters for voxel amount range in debug

introduce a secondary amp lfo per each voice, following same principle as current (floating rate), but sitting in mid range rate by default, with some randomisation per voice across all involved lfos

add a very slow pan lfo to each voice, with randomised phase and somewhat randomised length

consolidate voice controls under macro controls which control all voices at the same time, with further automatic minor randomisarion

we need to redesign all costs with new resources in mind


we will add a Hauler tool. It creates a "packaged materials" voxel. First click on the hauler pop ups a sub dialog that asks which resource to put into voxel. Adjacent voxels are recognised as a singler Hauler. Engine voxels can be attached to it separately. Amount of engine voxels vs amount of matter defines how long will it take for resource to reach Home. Once engines are attached the hauler can be launched Home. There is a high-score for how many resource were sent home.
There are occasional missions for specfic resource packages.


replace "unlock all research tools" button in debug with "unlock all tools" (so that it includes battery etc.)

hide resources that the player doesn't own currently from the desplayed list.

we will separate depth scanner into a range of scanners with different focuses, grounded in science. We will expand the range of depth overlays accordingly. Each one will show the voxels that it specializes on as opaque among the otherwise transparent.


Extend into debris pieces generation. Introduce upstream “regoliths” etc., preserve as much as possible of downstream chemistry.