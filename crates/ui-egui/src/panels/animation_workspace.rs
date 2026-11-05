//! A wider authoring workspace for the native prototype animation model.
//!
//! This editor intentionally edits the document's real per-layer scroll animations. It is not a
//! browser/DOM editor: the native prototype player evaluates these actions in FigCraft's renderer.

use egui::{Align2, Color32, CornerRadius, Id, Rect, Sense, Stroke, StrokeKind, Ui, pos2, vec2};
use figcraft_doc::proto::{AnimationProperty, AnimationStep, Easing, ScrollAnimation, ScrollAnimationTrigger};
use figcraft_doc::{Document, Node, NodeId};
use serde_json::json;

use crate::FigApp;
use crate::i18n::tr;
use crate::theme::{Tokens, regular, semibold};

const OPEN_ID: &str = "advanced-visual-animation-workspace";

/// Open the animation workspace over the design canvas.
pub fn open(ctx: &egui::Context) {
    ctx.data_mut(|d| d.insert_temp(Id::new(OPEN_ID), true));
}

/// Draw the workspace while it is open.
pub fn show(app: &mut FigApp, ctx: &egui::Context) {
    let mut open = ctx.data(|d| d.get_temp::<bool>(Id::new(OPEN_ID))).unwrap_or(false);
    if !open {
        return;
    }
    egui::Window::new(tr("Advanced Visual Animation Builder"))
        .id(Id::new(OPEN_ID))
        .open(&mut open)
        .default_size(vec2(1080.0, 720.0))
        .min_size(vec2(820.0, 560.0))
        .resizable(true)
        .collapsible(false)
        .show(ctx, |ui| workspace(app, ui));
    ctx.data_mut(|d| d.insert_temp(Id::new(OPEN_ID), open));
}

fn workspace(app: &mut FigApp, ui: &mut Ui) {
    let Ok(ds) = app.session.ds() else {
        ui.label(tr("Open a document to edit animations."));
        return;
    };
    let doc = ds.doc.clone();
    let selection = ds.selection.clone();
    let Some(node_id) = selection.first().copied() else {
        ui.label(tr("Select a layer on the canvas to build its animation."));
        ui.label(tr("The workspace edits the selected layer and previews it with the native prototype player."));
        return;
    };
    let Some(node) = doc.node(node_id).cloned() else {
        ui.label(tr("The selected layer is no longer available."));
        return;
    };

    let mut animations = node.scroll_animations.clone();
    let animation_id = Id::new(("avab-animation", node_id.0));
    let step_id = Id::new(("avab-step", node_id.0));
    let mut animation_index = ui.ctx().data(|d| d.get_temp::<usize>(animation_id)).unwrap_or(0);
    animation_index = animation_index.min(animations.len().saturating_sub(1));
    let mut step_index = ui.ctx().data(|d| d.get_temp::<usize>(step_id)).unwrap_or(0);
    let original = animations.clone();

    toolbar(app, ui, &node, &mut animations, &mut animation_index);
    ui.add_space(8.0);
    let body_height = ui.available_height().max(360.0);
    ui.horizontal(|ui| {
        let left_width = (ui.available_width() * 0.19).clamp(150.0, 210.0);
        ui.allocate_ui(vec2(left_width, body_height), |ui| {
            layers_panel(ui, &doc, &node);
        });
        ui.separator();
        let center_width = (ui.available_width() * 0.63).max(360.0);
        ui.allocate_ui(vec2(center_width, body_height), |ui| {
            timeline_panel(ui, &doc, &node, &mut animations, &mut animation_index, &mut step_index);
        });
        ui.separator();
        ui.allocate_ui(vec2(ui.available_width(), body_height), |ui| {
            inspector_panel(ui, &doc, &node, &mut animations, animation_index, &mut step_index);
        });
    });

    ui.ctx().data_mut(|d| {
        d.insert_temp(animation_id, animation_index);
        d.insert_temp(step_id, step_index);
    });

    if animations != original {
        let animations: Vec<ScrollAnimation> = animations.into_iter().map(ScrollAnimation::sanitized).collect();
        app.set_props(&[node_id], json!({"scrollAnimations": animations}));
    }
}

fn toolbar(app: &mut FigApp, ui: &mut Ui, node: &Node, animations: &mut Vec<ScrollAnimation>, animation_index: &mut usize) {
    ui.horizontal_wrapped(|ui| {
        ui.label(egui::RichText::new(tr("ANIMATION WORKSPACE")).strong().size(10.0).color(Tokens::get(ui.ctx()).text_secondary));
        ui.separator();
        ui.label(egui::RichText::new(&node.name).strong());
        ui.separator();
        if ui.button(tr("Preview")).on_hover_text(tr("Open the native prototype preview")).clicked() {
            app.run("proto.preview", json!({}));
        }
        if ui.button(tr("+ New sequence")).clicked() && animations.len() < figcraft_doc::proto::MAX_SCROLL_ANIMATIONS {
            let mut animation = ScrollAnimation::default();
            animation.name = format!("Animation {}", animations.len() + 1);
            animations.push(animation);
            *animation_index = animations.len().saturating_sub(1);
        }
        ui.label(egui::RichText::new(tr("Autosaves to the selected layer")).small().color(Tokens::get(ui.ctx()).text_secondary));
    });
}

fn layers_panel(ui: &mut Ui, doc: &Document, selected: &Node) {
    ui.strong(tr("Layers"));
    ui.label(egui::RichText::new(tr("Select a layer on the canvas to edit it here.")).small().color(Tokens::get(ui.ctx()).text_secondary));
    ui.separator();
    let page = doc.page_of(selected.id).unwrap_or(selected.id);
    egui::ScrollArea::vertical().auto_shrink([false, false]).show(ui, |ui| {
        for id in doc.subtree(page) {
            if id == page {
                continue;
            }
            let Some(layer) = doc.node(id) else { continue };
            let depth = doc.ancestors(id).len().saturating_sub(doc.ancestors(page).len() + 1);
            let prefix = "  ".repeat(depth.min(5));
            let label = format!("{prefix}{}", layer.name);
            let active = id == selected.id;
            if active {
                ui.label(egui::RichText::new(label).strong().color(Tokens::get(ui.ctx()).accent));
            } else {
                ui.label(label);
            }
            if !layer.scroll_animations.is_empty() {
                ui.label(egui::RichText::new(format!("{} · {} {}", layer.scroll_animations.len(), tr("animation(s)"), if active { tr("selected") } else { "" })).small().color(Tokens::get(ui.ctx()).text_secondary));
            }
        }
    });
    ui.with_layout(egui::Layout::bottom_up(egui::Align::Min), |ui| {
        ui.separator();
        ui.label(egui::RichText::new(format!("{} · {}", tr("Active layer"), selected.name)).small().color(Tokens::get(ui.ctx()).text));
    });
}

fn timeline_panel(
    ui: &mut Ui,
    doc: &Document,
    node: &Node,
    animations: &mut Vec<ScrollAnimation>,
    animation_index: &mut usize,
    step_index: &mut usize,
) {
    ui.strong(tr("Sequences"));
    if animations.is_empty() {
        ui.label(tr("No sequences yet. Add a sequence to start."));
        return;
    }
    ui.horizontal_wrapped(|ui| {
        for (index, animation) in animations.iter().enumerate() {
            if ui.selectable_label(*animation_index == index, &animation.name).clicked() {
                *animation_index = index;
                *step_index = 0;
            }
        }
    });
    ui.separator();
    let Some(animation) = animations.get_mut(*animation_index) else { return };
    ui.horizontal(|ui| {
        ui.strong(tr("Scroll actions"));
        let mut add = None;
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            ui.menu_button("+ Add action", |ui| {
                ui.set_min_width(170.0);
                ui.label(tr("Transform"));
                for property in AnimationProperty::TRANSFORM {
                    if ui.button(property.label()).clicked() { add = Some(property); ui.close(); }
                }
                ui.separator();
                ui.label(tr("Style"));
                for property in AnimationProperty::STYLE {
                    if ui.button(property.label()).clicked() { add = Some(property); ui.close(); }
                }
                ui.separator();
                ui.label(tr("Size"));
                for property in AnimationProperty::SIZE {
                    if ui.button(property.label()).clicked() { add = Some(property); ui.close(); }
                }
            });
        });
        if let Some(property) = add && animation.steps.len() < figcraft_doc::proto::MAX_SCROLL_STEPS {
            add_action(animation, property);
            *step_index = animation.steps.len().saturating_sub(1);
        }
    });

    ui.label(egui::RichText::new(tr("Drag the white handles to set action timing. Select a track to edit its target and values.")).small().color(Tokens::get(ui.ctx()).text_secondary));
    timeline_ruler(ui);
    egui::ScrollArea::vertical().max_height(370.0).auto_shrink([false, false]).show(ui, |ui| {
        for (index, step) in animation.steps.iter_mut().enumerate() {
            timeline_track(ui, doc, node, *animation_index, index, step, step_index);
        }
    });
    if animation.steps.is_empty() {
        ui.label(tr("This sequence has no actions. Use Add action to create a track."));
    }
}

fn timeline_ruler(ui: &mut Ui) {
    let colors = Tokens::get(ui.ctx());
    let width = ui.available_width();
    let (rect, _) = ui.allocate_exact_size(vec2(width, 22.0), Sense::hover());
    for pct in [0.0_f32, 0.25, 0.5, 0.75, 1.0] {
        let x = egui::lerp(rect.x_range(), pct);
        let align = if pct == 0.0 { Align2::LEFT_CENTER } else if pct == 1.0 { Align2::RIGHT_CENTER } else { Align2::CENTER_CENTER };
        ui.painter().text(pos2(x, rect.center().y), align, format!("{}%", (pct * 100.0) as u32), regular(9.0), colors.text_secondary);
    }
}

fn timeline_track(
    ui: &mut Ui,
    doc: &Document,
    node: &Node,
    animation_index: usize,
    index: usize,
    step: &mut AnimationStep,
    selected: &mut usize,
) {
    let colors = Tokens::get(ui.ctx());
    let (row, response) = ui.allocate_exact_size(vec2(ui.available_width(), 42.0), Sense::click());
    if response.clicked() { *selected = index; }
    let active = *selected == index;
    ui.painter().rect_filled(row, CornerRadius::same(4), if active { colors.selected_row } else if response.hovered() { colors.hover } else { colors.panel });
    let label = Rect::from_min_max(pos2(row.min.x + 7.0, row.min.y), pos2(row.min.x + 88.0, row.max.y));
    ui.painter().with_clip_rect(label).text(label.left_center(), Align2::LEFT_CENTER, step.property.label(), regular(10.0), colors.text);
    let target_name = step.target.and_then(|id| doc.node(id)).map(|n| n.name.as_str()).unwrap_or("Trigger");
    ui.painter().with_clip_rect(Rect::from_min_max(pos2(row.min.x + 7.0, row.min.y + 19.0), pos2(row.min.x + 88.0, row.max.y)))
        .text(pos2(row.min.x + 7.0, row.min.y + 29.0), Align2::LEFT_CENTER, target_name, regular(8.0), colors.text_secondary);

    let track = Rect::from_min_max(pos2(row.min.x + 94.0, row.min.y + 11.0), pos2(row.max.x - 10.0, row.min.y + 25.0));
    ui.painter().rect_filled(track, CornerRadius::same(3), colors.field);
    let start_x = egui::lerp(track.x_range(), step.start.clamp(0.0, 1.0) as f32);
    let end_x = egui::lerp(track.x_range(), step.end.clamp(0.0, 1.0) as f32).max(start_x + 3.0);
    let bar = Rect::from_min_max(pos2(start_x, track.min.y), pos2(end_x.min(track.max.x), track.max.y));
    ui.painter().rect_filled(bar, CornerRadius::same(3), if active { colors.accent } else { colors.selected_row });

    let handle_size = vec2(10.0, 20.0);
    let start_handle = Rect::from_center_size(pos2(start_x, track.center().y), handle_size);
    let start = ui.interact(start_handle, Id::new(("avab-start", node.id.0, animation_index, index)), Sense::click_and_drag());
    if start.hovered() || start.dragged() { ui.ctx().set_cursor_icon(egui::CursorIcon::ResizeHorizontal); }
    if start.dragged() && let Some(pointer) = start.interact_pointer_pos() {
        step.start = ((pointer.x - track.left()) / track.width()).clamp(0.0, (step.end - 0.01).max(0.0) as f32) as f64;
        *selected = index;
    }
    let end_handle = Rect::from_center_size(pos2(end_x.min(track.right()), track.center().y), handle_size);
    let end = ui.interact(end_handle, Id::new(("avab-end", node.id.0, animation_index, index)), Sense::click_and_drag());
    if end.hovered() || end.dragged() { ui.ctx().set_cursor_icon(egui::CursorIcon::ResizeHorizontal); }
    if end.dragged() && let Some(pointer) = end.interact_pointer_pos() {
        step.end = ((pointer.x - track.left()) / track.width()).clamp((step.start + 0.01).min(1.0) as f32, 1.0) as f64;
        *selected = index;
    }
    ui.painter().rect_filled(start_handle.shrink(2.0), CornerRadius::same(2), Color32::WHITE);
    ui.painter().rect_filled(end_handle.shrink(2.0), CornerRadius::same(2), Color32::WHITE);
}

fn inspector_panel(
    ui: &mut Ui,
    doc: &Document,
    node: &Node,
    animations: &mut [ScrollAnimation],
    animation_index: usize,
    step_index: &mut usize,
) {
    ui.strong(tr("Inspector"));
    let Some(animation) = animations.get_mut(animation_index) else {
        ui.label(tr("Create a sequence to configure its trigger and actions."));
        return;
    };
    ui.label(tr("Trigger"));
    egui::ComboBox::from_id_salt(("avab-trigger", node.id.0, animation_index))
        .width(ui.available_width())
        .selected_text(animation.trigger.label())
        .show_ui(ui, |ui| {
            for trigger in ScrollAnimationTrigger::ALL {
                ui.selectable_value(&mut animation.trigger, trigger, trigger.label());
            }
        });
    ui.horizontal_wrapped(|ui| {
        ui.checkbox(&mut animation.enabled, tr("Enabled"));
        ui.checkbox(&mut animation.reverse, tr("Reverse"));
    });
    ui.label(tr("Sequence name"));
    ui.add_sized(vec2(ui.available_width(), 26.0), egui::TextEdit::singleline(&mut animation.name));
    ui.label(tr("Animation boundaries"));
    ui.add(egui::Slider::new(&mut animation.start, 0.0..=99.9).text(tr("Start %")));
    ui.add(egui::Slider::new(&mut animation.end, (animation.start + 0.1)..=100.0).text(tr("End %")));
    ui.horizontal(|ui| {
        ui.label(tr("Duration"));
        ui.add(egui::DragValue::new(&mut animation.duration_ms).range(0..=600_000).suffix(" ms"));
    });
    ui.horizontal(|ui| {
        ui.label(tr("Delay"));
        ui.add(egui::DragValue::new(&mut animation.delay_ms).range(0..=600_000).suffix(" ms"));
    });

    viewport_preview(ui, animation);
    ui.separator();
    let mut remove_action = false;
    {
        let Some(step) = animation.steps.get_mut(*step_index) else {
            ui.label(tr("Select a timeline action to edit it."));
            return;
        };
        ui.strong(format!("{} · {}", tr("Action"), step.property.label()));
        let page = doc.page_of(node.id).unwrap_or(node.id);
        ui.label(tr("Action target"));
        let target_name = step.target.and_then(|id| doc.node(id)).map(|n| n.name.clone()).unwrap_or_else(|| tr("Trigger element").into());
        egui::ComboBox::from_id_salt(("avab-target", node.id.0, animation_index, *step_index))
            .width(ui.available_width())
            .selected_text(target_name)
            .show_ui(ui, |ui| {
                ui.selectable_value(&mut step.target, None, tr("Trigger element"));
                for id in doc.subtree(page).into_iter().filter(|id| *id != page) {
                    let Some(candidate) = doc.node(id) else { continue };
                    ui.selectable_value(&mut step.target, Some(id), candidate.name.clone());
                }
            });

        egui::ComboBox::from_id_salt(("avab-property", node.id.0, animation_index, *step_index))
            .width(ui.available_width())
            .selected_text(step.property.label())
            .show_ui(ui, |ui| {
                for property in AnimationProperty::ALL {
                    ui.selectable_value(&mut step.property, property, property.label());
                }
            });
        let (low, high) = property_range(step.property);
        ui.horizontal(|ui| {
            ui.label(tr("From"));
            ui.add(egui::DragValue::new(&mut step.from).range(low..=high).speed(0.1));
        });
        ui.horizontal(|ui| {
            ui.label(tr("To"));
            ui.add(egui::DragValue::new(&mut step.to).range(low..=high).speed(0.1));
        });
        ui.add(egui::Slider::new(&mut step.start, 0.0..=0.999).text(tr("Track start")));
        ui.add(egui::Slider::new(&mut step.end, (step.start + 0.001)..=1.0).text(tr("Track end")));
        ui.label(tr("Easing"));
        egui::ComboBox::from_id_salt(("avab-easing", node.id.0, animation_index, *step_index))
            .width(ui.available_width())
            .selected_text(step.easing.label())
            .show_ui(ui, |ui| {
                for easing in Easing::ALL {
                    ui.selectable_value(&mut step.easing, easing, easing.label());
                }
                if ui.button(tr("Custom bezier…")).clicked() {
                    step.easing = Easing::CUSTOM_BEZIER;
                    ui.close();
                }
            });
        if let Easing::CustomBezier { x1, y1, x2, y2 } = step.easing {
            let mut points = [x1, y1, x2, y2];
            ui.label(tr("Cubic bezier control points"));
            for (index, value) in points.iter_mut().enumerate() {
                ui.horizontal(|ui| {
                    ui.label(["X1", "Y1", "X2", "Y2"][index]);
                    ui.add(egui::DragValue::new(value).speed(0.01).range(if index % 2 == 0 { 0.0..=1.0 } else { -2.0..=2.0 }));
                });
            }
            step.easing = Easing::CustomBezier { x1: points[0], y1: points[1], x2: points[2], y2: points[3] };
            bezier_preview(ui, step.easing);
        }
        remove_action = ui.button(tr("Remove action")).clicked();
    }
    if remove_action {
        if *step_index < animation.steps.len() {
            animation.steps.remove(*step_index);
        }
        *step_index = (*step_index).min(animation.steps.len().saturating_sub(1));
    }
}

fn property_range(property: AnimationProperty) -> (f64, f64) {
    match property {
        AnimationProperty::Opacity => (0.0, 1.0),
        AnimationProperty::Scale => (0.0, 100.0),
        AnimationProperty::Blur => (0.0, figcraft_doc::MAX_BLUR_RADIUS),
        AnimationProperty::Width | AnimationProperty::Height => (0.0, 100_000.0),
        AnimationProperty::TranslateX | AnimationProperty::TranslateY | AnimationProperty::Rotate | AnimationProperty::ParallaxY => (-10_000.0, 10_000.0),
    }
}

fn add_action(animation: &mut ScrollAnimation, property: AnimationProperty) {
    let (from, to) = match property {
        AnimationProperty::Opacity => (0.0, 1.0),
        AnimationProperty::Scale => (0.8, 1.0),
        AnimationProperty::Blur => (12.0, 0.0),
        AnimationProperty::Width | AnimationProperty::Height => (0.0, 100.0),
        AnimationProperty::TranslateX | AnimationProperty::TranslateY | AnimationProperty::ParallaxY | AnimationProperty::Rotate => (0.0, 100.0),
    };
    animation.steps.push(AnimationStep { property, target: None, from, to, start: 0.0, end: 1.0, easing: Easing::EaseOut });
}

fn viewport_preview(ui: &mut Ui, animation: &ScrollAnimation) {
    let colors = Tokens::get(ui.ctx());
    ui.label(tr("Viewport trigger"));
    let (rect, _) = ui.allocate_exact_size(vec2(ui.available_width(), 88.0), Sense::hover());
    ui.painter().rect_filled(rect, CornerRadius::same(5), colors.field);
    let viewport = Rect::from_min_max(pos2(rect.center().x - 28.0, rect.min.y + 5.0), pos2(rect.center().x + 28.0, rect.max.y - 5.0));
    ui.painter().rect_stroke(viewport, CornerRadius::same(3), Stroke::new(1.0, colors.border), StrokeKind::Inside);
    let x0 = egui::lerp(viewport.y_range(), (animation.start / 100.0) as f32);
    let x1 = egui::lerp(viewport.y_range(), (animation.end / 100.0) as f32);
    ui.painter().line_segment([pos2(viewport.left() - 5.0, x0), pos2(viewport.right() + 5.0, x0)], Stroke::new(2.0, colors.accent));
    ui.painter().line_segment([pos2(viewport.left() - 5.0, x1), pos2(viewport.right() + 5.0, x1)], Stroke::new(2.0, colors.text_secondary));
    ui.painter().text(pos2(rect.min.x + 8.0, rect.center().y), Align2::LEFT_CENTER, format!("{}%", animation.start.round()), regular(9.0), colors.accent);
    ui.painter().text(pos2(rect.max.x - 8.0, rect.center().y), Align2::RIGHT_CENTER, format!("{}%", animation.end.round()), regular(9.0), colors.text_secondary);
}

fn bezier_preview(ui: &mut Ui, easing: Easing) {
    let colors = Tokens::get(ui.ctx());
    let (rect, _) = ui.allocate_exact_size(vec2(ui.available_width(), 62.0), Sense::hover());
    ui.painter().rect_filled(rect, CornerRadius::same(4), colors.field);
    let mut points = Vec::with_capacity(25);
    for index in 0..=24 {
        let t = index as f64 / 24.0;
        let x = egui::lerp(rect.x_range(), t as f32);
        let y = egui::lerp(rect.y_range(), (1.0 - easing.eval(t)) as f32);
        points.push(pos2(x, y));
    }
    ui.painter().add(egui::Shape::line(points, Stroke::new(1.7, colors.accent)));
}
